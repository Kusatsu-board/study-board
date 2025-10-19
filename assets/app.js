// assets/app.js
// 中核: DM / フレンド / 通知 / 既読 / 画像送信 / リアクション
// 使い方: 各ページでこのファイルを defer で読み込んでください。
// 依存: firebase-app-compat, firebase-auth-compat, firebase-firestore-compat, firebase-storage-compat

(function(){
  // ---------- Firebase init (既存設定と同じにする) ----------
  const firebaseConfig = {
    apiKey: "AIzaSyBfstQdl-avHfBWaiPkC0Bzwm_9apWe6Mo",
    authDomain: "school-board-e2ee2.firebaseapp.com",
    projectId: "school-board-e2ee2",
    storageBucket: "school-board-e2ee2.appspot.com",
    messagingSenderId: "257360614407",
    appId: "1:257360614407:web:7cdae33b9ac7d7a671c6a2"
  };
  if(!window.firebase) { console.error('Firebaseがロードされていません'); return; }
  if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const storage = firebase.storage();

  // ---------- ユーティリティ ----------
  const $ = s => document.querySelector(s);
  function showToast(msg,ms=1800){ window.showToast ? window.showToast(msg,ms) : alert(msg); }
  function uid(){ return auth.currentUser ? auth.currentUser.uid : null; }

  // ---------- Firestore コレクション設計（参照） ----------
  // users/{uid}:
  //   displayName, iconUrl, grade, bio, friends:[], friendRequests:[], blocked:[], muted:[]
  // messages/{chatId}/messages/{msgId}  （chatId: dm_{sorted uid pair} または group_{id}）
  //   { senderId, senderName, text, createdAt, readBy:[], reactions: {uid:emoji,...}, imageUrl? }
  // chats/{chatId}:
  //   { type: 'dm'|'group', participants:[], lastMessage, lastAt, groupName?, owner? }
  // groups/{gid}: { name, owner, members:[], invited:[], createdAt }
  // notifications/{nid}: { targetUid, type, senderUid, data:{...}, read:false, createdAt }

  // ---------- ヘルパー：チャットID作成（個別DM用） ----------
  function makeDmId(a,b){
    if(!a||!b) return null;
    return 'dm_' + [a,b].sort().join('_');
  }

  // ---------- DM（チャット）: sendMessage ----------
  // opts: { chatId (or toUid for new dm), text, file (File obj), type:'dm'|'group' }
  async function sendMessage(opts){
    if(!auth.currentUser) { showToast('ログインが必要です'); return; }
    const fromUid = auth.currentUser.uid;
    const fromName = auth.currentUser.displayName || (auth.currentUser.email||'').split('@')[0];
    let chatId = opts.chatId;
    if(!chatId && opts.toUid){
      chatId = makeDmId(fromUid, opts.toUid);
      // ensure chats doc exists
      const chatRef = db.collection('chats').doc(chatId);
      const chatDoc = await chatRef.get();
      if(!chatDoc.exists){
        await chatRef.set({
          type: 'dm',
          participants: [fromUid, opts.toUid],
          lastMessage: '',
          lastAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    if(!chatId){ showToast('送信先が不明です'); return; }

    const messagesRef = db.collection('messages').doc(chatId).collection('messages');
    const chatRef = db.collection('chats').doc(chatId);

    showLoading(true);
    try{
      let imageUrl = '';
      if(opts.file){
        const f = opts.file;
        const ext = f.name.split('.').pop();
        const path = `chat_images/${chatId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const snap = await storage.ref().child(path).put(f);
        imageUrl = await snap.ref.getDownloadURL();
      }

      const payload = {
        senderId: fromUid,
        senderName: fromName,
        text: opts.text || '',
        imageUrl: imageUrl || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        readBy: [fromUid],
        reactions: {} // map from uid->emoji string
      };
      const msgRef = await messagesRef.add(payload);
      // update chat meta
      await chatRef.set({
        lastMessage: payload.text || (imageUrl? '📷 画像' : ''),
        lastAt: firebase.firestore.FieldValue.serverTimestamp(),
        participants: opts.participants || ( (opts.toUid)? [fromUid, opts.toUid] : undefined ),
        type: opts.type || 'dm'
      }, { merge:true });

      // create notification for recipients (if dm -> single other)
      if(opts.toUid){
        await db.collection('notifications').add({
          targetUid: opts.toUid,
          type: 'dm',
          senderUid: fromUid,
          data: { chatId, msgId: msgRef.id, text: payload.text.slice(0,200) },
          read: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } else if(opts.participants && opts.participants.length){
        // group: notify everyone except sender
        const others = opts.participants.filter(u=>u!==fromUid);
        const batch = db.batch();
        others.forEach(u=>{
          const nref = db.collection('notifications').doc();
          batch.set(nref, {
            targetUid: u, type: 'dm', senderUid: fromUid, data:{ chatId, msgId:msgRef.id }, read:false, createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        });
        await batch.commit();
      }

      return msgRef.id;
    }catch(e){
      console.error(e);
      showToast('メッセージ送信に失敗しました');
    }finally{
      showLoading(false);
    }
  }

  // ---------- DM: listenMessages (リアルタイム購読)
  // onMessage callback(msgObj)
  function listenMessages(chatId, onMessage, onMeta){
    if(!chatId) return ()=>{};
    const col = db.collection('messages').doc(chatId).collection('messages').orderBy('createdAt','asc');
    const unsub = col.onSnapshot(snap=>{
      snap.docChanges().forEach(ch=>{
        if(ch.type === 'added' || ch.type === 'modified'){
          const d = ch.doc.data();
          d.id = ch.doc.id;
          onMessage && onMessage(d);
        }
      });
      onMeta && onMeta(snap);
    }, err=> console.error('listenMessages err',err));
    return unsub;
  }

  // ---------- 既読管理 ----------
  // subscribe した後、表示したメッセージは readBy に自uidを入れる
  async function markMessagesRead(chatId, msgIds){
    if(!auth.currentUser) return;
    const me = auth.currentUser.uid;
    if(!msgIds || msgIds.length===0) return;
    const batch = db.batch();
    msgIds.forEach(mid=>{
      const ref = db.collection('messages').doc(chatId).collection('messages').doc(mid);
      batch.update(ref, { readBy: firebase.firestore.FieldValue.arrayUnion(me) });
    });
    try{ await batch.commit(); } catch(e){ console.error('mark read err', e); }
  }

  // ---------- リアクション（メッセージに絵文字リアクション） ----------
  // reaction is a short string (emoji)
  async function reactToMessage(chatId, msgId, reaction){
    if(!auth.currentUser) return;
    const me = auth.currentUser.uid;
    const ref = db.collection('messages').doc(chatId).collection('messages').doc(msgId);
    await db.runTransaction(async tr=>{
      const s = await tr.get(ref);
      if(!s.exists) return;
      const data = s.data();
      const reactions = data.reactions || {};
      // toggle same reaction by same user -> remove, else set
      if(reactions[me] === reaction) delete reactions[me];
      else reactions[me] = reaction;
      tr.update(ref, { reactions });
    });
  }

  // ---------- チャット一覧を購読（未読カウントを反映） ----------
  function subscribeChats(onUpdate){
    // チャットメタは chats/{chatId}
    // 参加しているチャットを取得（where participants array-contains uid）
    auth.onAuthStateChanged(user=>{
      if(!user){ onUpdate && onUpdate([]); return; }
      const uid = user.uid;
      db.collection('chats').where('participants','array-contains',uid).orderBy('lastAt','desc')
        .onSnapshot(async snap=>{
          const out = await Promise.all(snap.docs.map(async d=>{
            const c = d.data(); c.id = d.id;
            // compute unread by checking messages subcollection where readBy not contains uid
            const msgs = await db.collection('messages').doc(d.id).collection('messages').where('readBy','not-in',[[uid]]).get().catch(()=>({empty:true}));
            const unread = msgs && !msgs.empty ? msgs.size : 0;
            c.unread = unread;
            return c;
          }));
          onUpdate && onUpdate(out);
        });
    });
  }

  // ---------- チャット作成（グループ） ----------
  async function createGroup(name, members){
    if(!auth.currentUser) { showToast('ログインが必要です'); return; }
    const owner = auth.currentUser.uid;
    const gid = 'group_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
    try{
      await db.collection('groups').doc(gid).set({ name, owner, members, invited:[], createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      // create chat
      await db.collection('chats').doc(gid).set({ type:'group', participants: members, groupName:name, owner, lastAt: firebase.firestore.FieldValue.serverTimestamp() });
      return gid;
    }catch(e){ console.error(e); showToast('グループ作成失敗'); }
  }

  // ---------- フレンド：申請 / 承認 / 拒否 / ブロック / ミュート ----------
  async function sendFriendRequest(targetUid){
    const me = uid();
    if(!me){ showToast('ログインしてください'); return; }
    if(me === targetUid) return;
    try{
      await db.collection('users').doc(targetUid).collection('friendRequests').doc(me).set({
        from: me, createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      // notification
      await db.collection('notifications').add({ targetUid, type:'friend_request', senderUid:me, data:{}, read:false, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      showToast('友達申請を送信しました');
    }catch(e){ console.error(e); showToast('申請に失敗しました'); }
  }

  async function acceptFriendRequest(fromUid){
    const me = uid();
    if(!me) return;
    const meRef = db.collection('users').doc(me);
    const otherRef = db.collection('users').doc(fromUid);
    try{
      await db.runTransaction(async tr=>{
        tr.update(meRef, { friends: firebase.firestore.FieldValue.arrayUnion(fromUid) });
        tr.update(otherRef, { friends: firebase.firestore.FieldValue.arrayUnion(me) });
        // remove request doc
        tr.delete(db.collection('users').doc(me).collection('friendRequests').doc(fromUid));
      });
      // notify
      await db.collection('notifications').add({ targetUid: fromUid, type:'friend_accepted', senderUid: me, data:{}, read:false, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      showToast('友達になりました');
    }catch(e){ console.error(e); showToast('承認に失敗しました'); }
  }

  async function rejectFriendRequest(fromUid){
    const me = uid();
    if(!me) return;
    try{
      await db.collection('users').doc(me).collection('friendRequests').doc(fromUid).delete();
      showToast('申請を拒否しました');
    }catch(e){ console.error(e); showToast('操作失敗'); }
  }

  async function blockUser(targetUid){
    const me = uid();
    if(!me) return;
    await db.collection('users').doc(me).update({ blocked: firebase.firestore.FieldValue.arrayUnion(targetUid) });
    showToast('ブロックしました');
  }
  async function muteUser(targetUid){
    const me = uid();
    if(!me) return;
    await db.collection('users').doc(me).update({ muted: firebase.firestore.FieldValue.arrayUnion(targetUid) });
    showToast('ミュートしました');
  }

  // ---------- 通知購読（リアルタイム） ----------
  function subscribeNotifications(onUpdate){
    auth.onAuthStateChanged(user=>{
      if(!user) { onUpdate && onUpdate([]); return; }
      db.collection('notifications').where('targetUid','==', user.uid).orderBy('createdAt','desc').onSnapshot(snap=>{
        const arr = snap.docs.map(d=>({ id:d.id, ...d.data() }));
        onUpdate && onUpdate(arr);
      });
    });
  }

  async function markNotificationRead(nid){
    try{ await db.collection('notifications').doc(nid).update({ read:true }); }catch(e){console.error(e);}
  }

  // ---------- Presence（簡易：lastSeen） ----------
  // NOTE: 高精度 presence なら Realtime Database を使うのを推奨
  function touchPresence(){
    if(!auth.currentUser) return;
    db.collection('users').doc(auth.currentUser.uid).set({ lastSeen: firebase.firestore.FieldValue.serverTimestamp() }, { merge:true });
  }
  setInterval(touchPresence, 1000*60*2); // 2分おき

  // ---------- Web Push 登録（フロー） ----------
  // 実運用にはサーバ側 VAPID keys とトークン保存が必要。ここではブラウザ側登録の開始ポイントだけ用意。
  async function registerPushSubscription(vapidPublicKeyBase64){
    if(!('serviceWorker' in navigator) || !('PushManager' in window)){ showToast('プッシュ未対応'); return null; }
    try{
      const reg = await navigator.serviceWorker.register('/sw.js'); // サーバに sw.js を配置する必要あり
      const sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKeyBase64) });
      // サブスク情報をサーバ（または Firestore の users/{uid}/subscriptions）に保存
      await db.collection('users').doc(uid()).collection('pushSubscriptions').doc(btoa(sub.endpoint)).set({ subscription: sub.toJSON(), createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      showToast('プッシュ通知を登録しました');
      return sub;
    }catch(e){ console.error(e); showToast('プッシュ登録失敗'); return null; }
  }
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  // ---------- エクスポート ----------
  window.SB = window.SB || {};
  Object.assign(window.SB, {
    sendMessage, listenMessages, markMessagesRead, reactToMessage,
    subscribeChats, createGroup, sendFriendRequest, acceptFriendRequest, rejectFriendRequest, blockUser, muteUser,
    subscribeNotifications, markNotificationRead, registerPushSubscription
  });

  // 初期 presence touch
  auth.onAuthStateChanged(u=>{ if(u) touchPresence(); });
})();
