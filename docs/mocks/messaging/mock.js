/*
 * Messaging mocks (team messaging decision, 2026-11-08). One clickable engine shared by the three
 * options; each option's page styles it. Everything here is made up: no real people or photos.
 * Open index.html in a browser. Nothing is sent anywhere.
 */
(function () {
  "use strict";

  const OPTION = window.MOCK_OPTION || { id: "C", name: "Academy blend" };

  // ---- Made-up data -------------------------------------------------------------------------

  const DEPTS = {
    camera: { name: "Camera Operations", short: "Camera team", hue: "blue", icon: "camera", members: 14 },
    audio: { name: "Audio Engineering", short: "Audio team", hue: "teal", icon: "audio", members: 9 },
    directing: { name: "Camera Directing", short: "Directing team", hue: "coral", icon: "directing", members: 6 },
    graphics: { name: "Computer Graphics and ProPresenter", short: "Graphics team", hue: "violet", icon: "graphics", members: 8 },
  };

  const PEOPLE = {
    jordan: { name: "Jordan Lee", initials: "JL", dept: "camera", leader: true },
    riley: { name: "Riley Chen", initials: "RC", dept: "camera" },
    sam: { name: "Sam Okafor", initials: "SO", dept: "camera" },
    taylor: { name: "Taylor Brooks", initials: "TB", dept: "camera" },
    morgan: { name: "Morgan Ali", initials: "MA", dept: "directing", leader: true },
    priya: { name: "Priya Shah", initials: "PS", dept: "audio", leader: true },
    avery: { name: "Avery Kim", initials: "AK", dept: "graphics" },
    casey: { name: "Casey Moore", initials: "CM", dept: "audio" },
    dana: { name: "Dana Fox", initials: "DF", dept: "graphics" },
    eli: { name: "Eli Grant", initials: "EG", dept: "camera" },
    me: { name: "You", initials: "AR", dept: "camera" },
  };

  const CHATS = [
    { id: "everyone", kind: "group", title: "Everyone in the Academy", members: 48, everyone: true, unread: 0, time: "Mon", last: "Jordan: Team night is Friday at 7. Bring a friend." },
    { id: "camera", kind: "dept", dept: "camera", unread: 3, time: "9:33", last: "Jordan: Thanks Taylor. The spare plate is in the grey case." },
    { id: "directing", kind: "dept", dept: "directing", unread: 1, time: "8:50", last: "Morgan: Run of service is updated for Sunday." },
    { id: "audio", kind: "dept", dept: "audio", unread: 0, time: "Yesterday", last: "Priya: Channel 12 is the pastor's lapel mic now." },
    { id: "graphics", kind: "dept", dept: "graphics", unread: 0, time: "Thu", last: "Avery: Lyrics for the new song are in." },
    { id: "dm-riley", kind: "dm", person: "riley", unread: 2, time: "9:40", last: "Can you swap to camera 2 on the 23rd?" },
    { id: "dm-morgan", kind: "dm", person: "morgan", unread: 0, time: "Tue", last: "You: Sounds good, see you at call time." },
    { id: "dm-taylor", kind: "dm", person: "taylor", unread: 0, time: "Oct 30", last: "Photo" },
  ];

  // Thread for the Camera Operations chat. Photos are drawn, not real.
  const THREAD = [
    { day: "Today" },
    { id: "m1", from: "riley", time: "9:12", text: "Photos from this morning's walkthrough. The new riser is in." },
    { id: "m2", from: "riley", time: "9:12", photos: [0, 1] },
    { id: "m3", from: "sam", time: "9:15", text: "Is camera 2 still on the long lens?" },
    { id: "m4", from: "jordan", time: "9:18", reply: "m3", text: "Yes, the 70–200 on camera 2. Lock focus on the pulpit before doors open." },
    { id: "m5", from: "me", time: "9:20", text: "Got it. I'm on camera 3 this week." },
    { id: "m6", from: "taylor", time: "9:31", text: "Tripod plate on camera 1 is cracked. Flagged it.", photos: [2, 3, 1] },
    { id: "m7", from: "jordan", time: "9:33", text: "Thanks Taylor. The spare plate is in the grey case." },
    { id: "m8", from: "jordan", time: "9:40", text: "Run sheet for Sunday.", doc: { name: "Sunday run sheet.pdf", kind: "PDF", size: "240 KB" } },
    { id: "m9", from: "sam", time: "9:41", gif: 0 },
  ];

  // Drawn stand-ins for GIFs from GIPHY search (G, 2026-11-08: rated G only).
  const GIFS = ["Thumbs up", "Applause", "Let's go", "Thank you", "Coffee", "High five"];
  function gif(n) {
    return '<span class="gif-art g' + (n % 6) + '"><span>' + GIFS[n % 6] + "</span></span>";
  }

  // ---- Drawn photos (simple scenes, so nothing real is shown) -------------------------------

  function photo(n) {
    const scenes = [
      // Stage with lights
      '<rect width="320" height="220" fill="#151a2e"/><rect y="150" width="320" height="70" fill="#2a2238"/>' +
        '<polygon points="60,0 90,0 150,150 30,150" fill="#ffd27a" opacity=".22"/><polygon points="230,0 260,0 300,150 180,150" fill="#8ab4ff" opacity=".22"/>' +
        '<rect x="110" y="96" width="100" height="56" rx="4" fill="#3b3150"/><circle cx="75" cy="8" r="7" fill="#ffd27a"/><circle cx="245" cy="8" r="7" fill="#8ab4ff"/>',
      // Camera on tripod
      '<rect width="320" height="220" fill="#24302b"/><rect x="0" y="170" width="320" height="50" fill="#1a221f"/>' +
        '<rect x="120" y="58" width="96" height="54" rx="8" fill="#0d1110"/><rect x="214" y="72" width="34" height="26" rx="6" fill="#0d1110"/>' +
        '<circle cx="250" cy="85" r="9" fill="#3c5d8f"/><line x1="168" y1="112" x2="130" y2="190" stroke="#0d1110" stroke-width="6"/>' +
        '<line x1="168" y1="112" x2="206" y2="190" stroke="#0d1110" stroke-width="6"/><line x1="168" y1="112" x2="168" y2="194" stroke="#0d1110" stroke-width="6"/>',
      // Close-up of a tripod plate
      '<rect width="320" height="220" fill="#3a3530"/><rect x="70" y="70" width="180" height="80" rx="10" fill="#6d665e"/>' +
        '<rect x="90" y="88" width="140" height="44" rx="6" fill="#857d73"/><path d="M150 88 L162 110 L150 120 L166 132" stroke="#2a2622" stroke-width="3" fill="none"/>' +
        '<circle cx="110" cy="110" r="6" fill="#4a443e"/><circle cx="210" cy="110" r="6" fill="#4a443e"/>',
      // Monitor wall
      '<rect width="320" height="220" fill="#0e1016"/>' +
        '<rect x="24" y="30" width="84" height="52" rx="4" fill="#2b4a7a"/><rect x="118" y="30" width="84" height="52" rx="4" fill="#7a2b4a"/>' +
        '<rect x="212" y="30" width="84" height="52" rx="4" fill="#2b7a5c"/><rect x="24" y="94" width="178" height="100" rx="4" fill="#3d3a6b"/>' +
        '<rect x="212" y="94" width="84" height="100" rx="4" fill="#1e2433"/><rect x="36" y="168" width="60" height="12" rx="3" fill="#e9455a"/>',
    ];
    return '<svg viewBox="0 0 320 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + scenes[n % scenes.length] + "</svg>";
  }

  // ---- Icons (simple line icons, made for these mocks) --------------------------------------

  const ICON = {
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    audio: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>',
    directing: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
    graphics: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 14l3-4 3 3 2-2 3 3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    compose: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    send: '<path d="M5 12h12M12 6l6 6-6 6"/>',
    photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 8"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    reply: '<path d="M10 8 5 12l5 4"/><path d="M5 12h9a5 5 0 0 1 5 5v1"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    cap: '<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    check: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
    wifiOff: '<path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0"/><path d="M3 3l18 18"/><circle cx="12" cy="19" r="1"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    serve: '<path d="M4 6h16v12H4z"/><path d="M8 10h8M8 14h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a5 5 0 0 1 3.5 5v1"/>',
    tick: '<path d="m5 12 5 5 9-10"/>',
  };
  function icon(name, cls) {
    return '<svg class="ico ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' + ICON[name] + "</svg>";
  }

  // ---- State --------------------------------------------------------------------------------

  const SCREENS = [
    { id: "list", label: "1 · Chat list" },
    { id: "thread", label: "2 · Department chat" },
    { id: "compose", label: "3 · Writing with a photo" },
    { id: "viewer", label: "4 · Photo viewer" },
    { id: "dm", label: "5 · New direct message" },
    { id: "leader", label: "6 · Leader deletes" },
    { id: "states", label: "7 · Empty and offline" },
    { id: "settings", label: "8 · Notification settings" },
    { id: "group", label: "9 · New group chat (leaders)" },
    { id: "attach", label: "10 · GIFs and documents" },
    { id: "nav", label: "Where Messages lives" },
  ];

  // G's choice, 2026-11-08: Messages in the centre of the phone tabs, with Checklist and SOPs merged
  // into Serve; on a computer, in the side bar.
  const NAV_PHONE = 2;
  const NAV_COMPUTER = 1;

  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isNarrow = window.innerWidth < 900;
  const state = {
    screen: "list",
    device: isNarrow ? "phone" : "computer",
    theme: prefersDark ? "dark" : "light",
    chat: "camera",
    query: "",
    deleted: {},
    menuFor: null,
    confirmFor: null,
    viewer: null,
    compose: { stage: "idle", progress: 0, text: "" },
    dmQuery: "",
    dmPicked: null,
    statesView: "empty",
    notify: { serving: "phone", training: "phone", leading: "email", messages: "phone" },
    muted: { audio: true },
    navPhone: NAV_PHONE,
    navComputer: NAV_COMPUTER,
    sent: [],
    attachOpen: false,
    gifOpen: false,
    gifQuery: "",
    docUpload: null,
    group: { name: "", everyone: true, picked: {}, created: false },
  };

  // Each screen opens on the right chat and situation, so every screen can be reached directly.
  function goScreen(id) {
    state.screen = id;
    state.menuFor = null;
    state.confirmFor = null;
    state.viewer = id === "viewer" ? { photos: [2, 3, 1], index: 0, from: "taylor", time: "9:31" } : null;
    if (["thread", "compose", "leader", "viewer"].includes(id)) state.chat = "camera";
    if (id === "compose") state.compose = { stage: "picked", progress: 0, text: "New framing for camera 3" };
    if (id === "leader") state.menuFor = "m6";
    if (id === "dm") { state.dmPicked = null; state.dmQuery = ""; }
    if (id === "group") state.group = { name: "Sunday volunteers", everyone: true, picked: {}, created: false };
    state.attachOpen = id === "attach";
    state.gifOpen = false;
    state.docUpload = null;
    if (id === "attach") state.chat = "camera";
    render();
    if (id === "compose") startUpload();
  }

  let uploadTimer = null;
  function startUpload() {
    clearInterval(uploadTimer);
    state.compose.stage = "resizing";
    state.compose.progress = 0;
    render();
    setTimeout(function () {
      state.compose.stage = "uploading";
      render();
      uploadTimer = setInterval(function () {
        state.compose.progress = Math.min(100, state.compose.progress + 9);
        if (state.compose.progress >= 100) {
          clearInterval(uploadTimer);
          state.compose.stage = "ready";
        }
        render();
      }, 160);
    }, 900);
  }

  // ---- Pieces -------------------------------------------------------------------------------

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function avatarFor(chat) {
    if (chat.kind === "group") return '<span class="avatar group">' + icon("users") + "</span>";
    if (chat.kind === "dept") {
      const d = DEPTS[chat.dept];
      return '<span class="avatar dept" data-hue="' + d.hue + '">' + icon(d.icon) + "</span>";
    }
    const p = PEOPLE[chat.person];
    return '<span class="avatar person" data-hue="' + DEPTS[p.dept].hue + '">' + p.initials + "</span>";
  }

  function chatTitle(chat) {
    if (chat.kind === "group") return chat.title;
    return chat.kind === "dept" ? DEPTS[chat.dept].name : PEOPLE[chat.person].name;
  }

  function chatRow(chat) {
    const active = state.device === "computer" && state.chat === chat.id && state.screen !== "settings" && state.screen !== "nav";
    return (
      '<button class="chat-row' + (active ? " active" : "") + (chat.unread ? " unread" : "") + '" data-act="open" data-id="' + chat.id + '">' +
      avatarFor(chat) +
      '<span class="chat-main"><span class="chat-name">' + esc(chatTitle(chat)) + "</span>" +
      '<span class="chat-preview">' + esc(chat.last) + "</span></span>" +
      '<span class="chat-meta"><span class="chat-time">' + chat.time + "</span>" +
      (chat.unread ? '<span class="badge" aria-label="' + chat.unread + ' unread">' + chat.unread + "</span>" : "") +
      "</span></button>"
    );
  }

  function chatList() {
    const q = state.query.trim().toLowerCase();
    const match = function (c) { return !q || chatTitle(c).toLowerCase().includes(q) || c.last.toLowerCase().includes(q); };
    const groups = CHATS.filter(function (c) { return c.kind === "group" && match(c); });
    const depts = CHATS.filter(function (c) { return c.kind === "dept" && match(c); });
    const dms = CHATS.filter(function (c) { return c.kind === "dm" && match(c); });
    return (
      '<div class="list">' +
      '<div class="list-head"><h1 class="list-title">Messages</h1>' +
      '<button class="icon-btn accent" data-act="screen" data-id="dm" aria-label="New message">' + icon("compose") + "</button></div>" +
      '<label class="search">' + icon("search") + '<input data-input="query" placeholder="Search chats and people" value="' + esc(state.query) + '" aria-label="Search chats and people"></label>' +
      (groups.length ? '<h2 class="section-label">Group chats</h2>' + groups.map(chatRow).join("") : "") +
      (depts.length ? '<h2 class="section-label">Department chats</h2>' + depts.map(chatRow).join("") : "") +
      (dms.length ? '<h2 class="section-label">Direct messages</h2>' + dms.map(chatRow).join("") : "") +
      (!groups.length && !depts.length && !dms.length ? '<p class="muted pad">Nothing matches "' + esc(state.query) + '".</p>' : "") +
      "</div>"
    );
  }

  function messageHtml(m, prev) {
    if (m.day) return '<div class="day"><span>' + m.day + "</span></div>";
    const p = PEOPLE[m.from];
    const mine = m.from === "me";
    const grouped = prev && prev.from === m.from && !prev.day;
    const del = state.deleted[m.id];
    const canLead = state.screen === "leader";
    let body = "";
    if (del) {
      body = '<div class="bubble deleted">' + icon("trash") + (del === "leader" ? "Message deleted by a leader" : "You deleted this message") + "</div>";
    } else {
      if (m.reply) {
        const r = THREAD.find(function (x) { return x.id === m.reply; });
        body += '<div class="reply-quote"><b>' + esc(PEOPLE[r.from].name) + "</b> " + esc(r.text) + "</div>";
      }
      if (m.text) body += '<div class="bubble">' + esc(m.text) + "</div>";
      if (m.doc) {
        body +=
          '<button class="doc" data-act="noop" aria-label="Open ' + esc(m.doc.name) + '">' +
          '<span class="doc-icon">' + icon("file") + "</span>" +
          '<span class="doc-info"><b>' + esc(m.doc.name) + "</b><span>" + m.doc.kind + " · " + m.doc.size + " · Tap to open</span></span></button>";
      }
      if (m.gif !== undefined) {
        body += '<span class="gif" role="img" aria-label="GIF: ' + GIFS[m.gif % 6] + '">' + gif(m.gif) + '<span class="gif-badge">GIF</span></span>';
      }
      if (m.photos) {
        body +=
          '<div class="photos n' + Math.min(m.photos.length, 3) + '">' +
          m.photos
            .map(function (ph, i) {
              return '<button class="photo" data-act="view" data-id="' + m.id + '" data-i="' + i + '" aria-label="Open photo ' + (i + 1) + ' of ' + m.photos.length + '">' + photo(ph) + "</button>";
            })
            .join("") +
          "</div>";
      }
    }
    const menuOpen = state.menuFor === m.id && !del;
    return (
      '<div class="msg ' + (mine ? "mine" : "theirs") + (grouped ? " grouped" : "") + (del ? " is-deleted" : "") + '">' +
      (!mine && !grouped ? '<span class="avatar person sm" data-hue="' + DEPTS[p.dept].hue + '">' + p.initials + "</span>" : !mine ? '<span class="avatar-space"></span>' : "") +
      '<div class="msg-col">' +
      (!mine && !grouped ? '<div class="msg-author">' + esc(p.name) + (p.leader ? '<span class="role">Leader</span>' : "") + "</div>" : "") +
      body +
      '<div class="msg-time">' + m.time + (mine && !del ? " · Read" : "") + "</div>" +
      "</div>" +
      ((canLead || mine) && !del
        ? '<button class="msg-more" data-act="menu" data-id="' + m.id + '" aria-label="Message actions">' + icon("more") + "</button>"
        : "") +
      (menuOpen
        ? '<div class="menu" role="menu">' +
          '<button role="menuitem" data-act="noop">' + icon("reply") + "Reply</button>" +
          '<button role="menuitem" class="danger" data-act="ask-delete" data-id="' + m.id + '">' + icon("trash") + "Delete message</button>" +
          (canLead && !mine ? '<p class="menu-note">You lead Camera Operations, so you can delete any message here.</p>' : "") +
          "</div>"
        : "") +
      "</div>"
    );
  }

  function composer() {
    const c = state.compose;
    const offline = state.screen === "states" && state.statesView === "offline";
    let attach = "";
    if (state.screen === "compose" && c.stage !== "idle") {
      attach =
        '<div class="upload">' +
        '<span class="upload-thumb">' + photo(1) + "</span>" +
        '<span class="upload-info">' +
        (c.stage === "resizing" || c.stage === "picked"
          ? "<b>Making it smaller…</b><span>Original 4.2 MB, 4032 × 3024</span>"
          : c.stage === "uploading"
            ? "<b>Uploading " + c.progress + "%</b><span>Resized to 1600 × 1200 · 268 KB WebP</span>"
            : "<b>Ready to send</b><span>1600 × 1200 · 268 KB, was 4.2 MB</span>") +
        (c.stage === "uploading" ? '<span class="bar"><span style="width:' + c.progress + '%"></span></span>' : "") +
        "</span>" +
        '<button class="icon-btn sm" data-act="remove-photo" aria-label="Remove photo">' + icon("close") + "</button></div>";
    }
    if (state.docUpload) {
      const d = state.docUpload;
      attach =
        '<div class="upload">' +
        '<span class="upload-thumb doc-icon">' + icon("file") + "</span>" +
        '<span class="upload-info"><b>' + (d.progress < 100 ? "Uploading " + d.progress + "%" : "Ready to send") + "</b><span>Sunday run sheet.pdf · PDF · 240 KB</span>" +
        (d.progress < 100 ? '<span class="bar"><span style="width:' + d.progress + '%"></span></span>' : "") +
        "</span>" +
        '<button class="icon-btn sm" data-act="remove-doc" aria-label="Remove document">' + icon("close") + "</button></div>";
    }
    const text = state.screen === "compose" ? c.text : "";
    const attachMenu = state.attachOpen
      ? '<div class="attach-menu" role="menu">' +
        '<button role="menuitem" data-act="pick-photo">' + icon("photo") + "<span><b>Photo</b><small>Made smaller before it's sent</small></span></button>" +
        '<button role="menuitem" data-act="open-gifs">' + '<span class="gif-mark">GIF</span>' + "<span><b>GIF</b><small>Search GIPHY, rated G only</small></span></button>" +
        '<button role="menuitem" data-act="pick-doc">' + icon("file") + "<span><b>Document</b><small>PDF, Word, Excel, PowerPoint or text, up to 10 MB</small></span></button>" +
        "</div>"
      : "";
    const gifPanel = state.gifOpen
      ? '<div class="gif-panel" role="dialog" aria-label="Choose a GIF">' +
        '<div class="gif-head"><label class="search">' + icon("search") + '<input data-input="gifQuery" placeholder="Search GIPHY" value="' + esc(state.gifQuery) + '" aria-label="Search GIPHY"></label>' +
        '<button class="icon-btn sm" data-act="close-gifs" aria-label="Close">' + icon("close") + "</button></div>" +
        '<div class="gif-grid">' +
        GIFS.map(function (name, i) { return { name: name, i: i }; })
          .filter(function (g) { return !state.gifQuery.trim() || g.name.toLowerCase().includes(state.gifQuery.trim().toLowerCase()); })
          .map(function (g) { return '<button class="gif-pick" data-act="send-gif" data-id="' + g.i + '" aria-label="Send ' + g.name + ' GIF">' + gif(g.i) + "</button>"; })
          .join("") +
        "</div>" +
        '<p class="gif-foot">Powered by GIPHY · Rated G only</p></div>'
      : "";
    return (
      '<div class="composer-wrap">' + attach + gifPanel + attachMenu +
      '<form class="composer" data-form="send">' +
      '<button type="button" class="icon-btn attach-btn" data-act="attach" aria-label="Add a photo, GIF or document" aria-expanded="' + Boolean(state.attachOpen) + '"' + (offline ? " disabled" : "") + ">" + icon("plus") + "</button>" +
      '<input class="composer-input" data-input="draft" placeholder="' + (offline ? "You're offline. This will send when you're back." : "Message") + '" value="' + esc(text) + '" aria-label="Message">' +
      '<button type="submit" class="send" aria-label="Send"' + (state.screen === "compose" && c.stage === "uploading" ? " disabled" : "") + ">" + icon("send") + "</button>" +
      "</form></div>"
    );
  }

  function threadHead(chat) {
    const sub =
      chat.kind === "group"
        ? chat.members + " people" + (chat.everyone ? " · everyone in the Academy, kept up to date" : "")
        : chat.kind === "dept"
          ? DEPTS[chat.dept].members + " people · members, position team and leaders"
          : DEPTS[PEOPLE[chat.person].dept].name;
    return (
      '<header class="thread-head">' +
      (state.device === "phone" ? '<button class="icon-btn" data-act="back" aria-label="Back to chats">' + icon("back") + "</button>" : "") +
      avatarFor(chat) +
      '<span class="thread-title"><b>' + esc(chatTitle(chat)) + "</b><span>" + esc(sub) + "</span></span>" +
      "</header>"
    );
  }

  function threadPane() {
    const chat = CHATS.find(function (c) { return c.id === state.chat; }) || CHATS[0];
    const offline = state.screen === "states" && state.statesView === "offline";
    const empty = state.screen === "states" && state.statesView === "empty";
    if (state.screen === "dm" && state.dmPicked) return dmThread(state.dmPicked);
    if (empty) {
      return (
        '<section class="thread">' + threadHead({ kind: "dept", dept: "graphics", id: "graphics" }) +
        '<div class="empty"><span class="empty-art">' + icon("chat") + "</span><h2>No messages yet</h2>" +
        "<p>This is the Graphics team's chat. Say hello, share a photo of the setup, or ask a question before Sunday.</p></div>" +
        composer() + "</section>"
      );
    }
    let msgs = "";
    if (chat.id === "camera") {
      THREAD.forEach(function (m, i) { msgs += messageHtml(m, THREAD[i - 1]); });
      state.sent.forEach(function (s, i) { msgs += messageHtml(Object.assign({ id: "s" + i, from: "me", time: "Now" }, s), { from: "me" }); });
    } else {
      msgs =
        '<div class="day"><span>Today</span></div>' +
        (chat.created ? '<div class="day"><span>You made this group for ' + (chat.everyone ? "everyone in the Academy" : chat.members + " people") + "</span></div>" : "") +
        (chat.created ? "" : messageHtml({ id: "x1", from: chat.kind === "dm" ? chat.person : chat.kind === "group" ? "jordan" : "morgan", time: chat.time, text: chat.last.replace(/^[^:]+: /, "") }, null));
    }
    return (
      '<section class="thread">' + threadHead(chat) +
      (offline ? '<div class="offline">' + icon("wifiOff") + "<span><b>You're offline.</b> Messages you write will send when you're back. Showing what you had.</span></div>" : "") +
      '<div class="messages">' + msgs + (offline ? '<div class="msg mine pending"><div class="msg-col"><div class="bubble">On my way, 10 minutes out</div><div class="msg-time">Waiting to send</div></div></div>' : "") + "</div>" +
      composer() + confirmDialog() + "</section>"
    );
  }

  function dmThread(personId) {
    const p = PEOPLE[personId];
    return (
      '<section class="thread">' + threadHead({ kind: "dm", person: personId, id: "new" }) +
      '<div class="safety">' + icon("shield") + "<span>The Production Director and Platform Admins can read direct messages to keep everyone safe.</span></div>" +
      '<div class="empty small"><span class="avatar person lg" data-hue="' + DEPTS[p.dept].hue + '">' + p.initials + "</span><h2>" + esc(p.name) + "</h2><p>" + esc(DEPTS[p.dept].name) + ". Start the conversation below.</p></div>" +
      composer() + "</section>"
    );
  }

  function dmPicker() {
    const q = state.dmQuery.trim().toLowerCase();
    const people = Object.keys(PEOPLE).filter(function (k) { return k !== "me" && PEOPLE[k].name.toLowerCase().includes(q); });
    return (
      '<div class="list picker">' +
      '<div class="list-head">' +
      (state.device === "phone" ? '<button class="icon-btn" data-act="screen" data-id="list" aria-label="Back to chats">' + icon("back") + "</button>" : "") +
      '<h1 class="list-title">New message</h1></div>' +
      '<label class="search">' + icon("search") + '<input data-input="dmQuery" placeholder="Find a person" value="' + esc(state.dmQuery) + '" aria-label="Find a person"></label>' +
      '<button class="chat-row" data-act="screen" data-id="group"><span class="avatar group">' + icon("users") + '</span><span class="chat-main"><span class="chat-name">New group chat</span><span class="chat-preview">Leaders: chosen people, or everyone in the Academy</span></span></button>' +
      '<h2 class="section-label">People in the Academy</h2>' +
      people
        .map(function (k) {
          const p = PEOPLE[k];
          return (
            '<button class="chat-row person-row' + (state.dmPicked === k ? " active" : "") + '" data-act="pick-person" data-id="' + k + '">' +
            '<span class="avatar person" data-hue="' + DEPTS[p.dept].hue + '">' + p.initials + "</span>" +
            '<span class="chat-main"><span class="chat-name">' + esc(p.name) + (p.leader ? '<span class="role">Leader</span>' : "") + "</span>" +
            '<span class="chat-preview">' + esc(DEPTS[p.dept].name) + "</span></span></button>"
          );
        })
        .join("") +
      (people.length ? "" : '<p class="muted pad">Nobody matches that.</p>') +
      "</div>"
    );
  }

  // Leaders make group chats: chosen people, or everyone in the Academy (kept up to date).
  function groupPicker() {
    const g = state.group;
    const chosen = Object.keys(g.picked).filter(function (k) { return g.picked[k]; });
    const count = g.everyone ? 48 : chosen.length + 1;
    return (
      '<div class="list picker">' +
      '<div class="list-head">' +
      (state.device === "phone" ? '<button class="icon-btn" data-act="screen" data-id="list" aria-label="Back to chats">' + icon("back") + "</button>" : "") +
      '<h1 class="list-title">New group chat</h1></div>' +
      '<label class="field-label" for="group-name">Name</label>' +
      '<input id="group-name" class="field" data-input="groupName" value="' + esc(g.name) + '" placeholder="For example, Sunday volunteers">' +
      '<button class="mute-row everyone-row" role="switch" aria-checked="' + g.everyone + '" data-act="group-everyone">' +
      '<span class="avatar group">' + icon("users") + "</span>" +
      "<span><b>Everyone in the Academy</b><br><small class=\"muted\">48 people now. New people join it automatically, and anyone who leaves the Academy leaves it.</small></span>" +
      '<span class="switch"><span></span></span></button>' +
      (g.everyone
        ? ""
        : '<h2 class="section-label">Or choose people</h2>' +
          Object.keys(PEOPLE)
            .filter(function (k) { return k !== "me"; })
            .map(function (k) {
              const p = PEOPLE[k];
              const on = Boolean(g.picked[k]);
              return (
                '<button class="chat-row person-row' + (on ? " active" : "") + '" role="checkbox" aria-checked="' + on + '" data-act="group-pick" data-id="' + k + '">' +
                '<span class="avatar person" data-hue="' + DEPTS[p.dept].hue + '">' + p.initials + "</span>" +
                '<span class="chat-main"><span class="chat-name">' + esc(p.name) + "</span>" +
                '<span class="chat-preview">' + esc(DEPTS[p.dept].name) + "</span></span>" +
                '<span class="tickbox">' + (on ? icon("tick") : "") + "</span></button>"
              );
            })
            .join("")) +
      '<p class="muted small pad">Only leaders can make group chats. You and the Production Director and Platform Admins can delete messages in it.</p>' +
      '<button class="btn primary wide" data-act="group-create"' + (!g.name.trim() || (!g.everyone && chosen.length === 0) ? " disabled" : "") + ">Make the group (" + count + " people)</button>" +
      "</div>"
    );
  }

  function confirmDialog() {
    if (!state.confirmFor) return "";
    const m = THREAD.find(function (x) { return x.id === state.confirmFor; });
    const mine = m && m.from === "me";
    return (
      '<div class="scrim" data-act="cancel"></div>' +
      '<div class="dialog" role="alertdialog" aria-label="Delete this message?">' +
      "<h2>Delete this message?</h2>" +
      "<p>" + (mine ? "It's removed for everyone." : "It's removed for everyone in Camera Operations, with its photos. The chat shows that a leader deleted it.") + " The audit log records who deleted it and when, not what it said.</p>" +
      '<div class="dialog-actions"><button class="btn" data-act="cancel">Cancel</button><button class="btn danger" data-act="delete" data-id="' + state.confirmFor + '">Delete</button></div>' +
      "</div>"
    );
  }

  function viewer() {
    const v = state.viewer;
    if (!v) return "";
    const p = PEOPLE[v.from];
    return (
      '<div class="viewer" role="dialog" aria-label="Photo">' +
      '<div class="viewer-top"><span><b>' + esc(p.name) + "</b> · Today " + v.time + "</span>" +
      '<button class="icon-btn" data-act="close-viewer" aria-label="Close">' + icon("close") + "</button></div>" +
      '<div class="viewer-photo">' + photo(v.photos[v.index]) + "</div>" +
      '<div class="viewer-bottom">' +
      '<button class="icon-btn" data-act="prev" aria-label="Previous photo"' + (v.index === 0 ? " disabled" : "") + ">" + icon("back") + "</button>" +
      "<span>" + (v.index + 1) + " of " + v.photos.length + " · Full size loads only when you open it</span>" +
      '<button class="icon-btn flip" data-act="next" aria-label="Next photo"' + (v.index === v.photos.length - 1 ? " disabled" : "") + ">" + icon("back") + "</button>" +
      "</div></div>"
    );
  }

  function settingsPage() {
    const groups = [
      { id: "serving", title: "Serving", hint: "Being scheduled, reminders, cover requests, and schedule changes" },
      { id: "training", title: "Training", hint: "Courses, results, approvals, certificates, and mentoring" },
      { id: "leading", title: "Leading", hint: "Join requests, assessments, and SOP reviews" },
      { id: "messages", title: "Messages", hint: "New messages in your chats, batched: one notice per chat, never one per message", isNew: true },
    ];
    return (
      '<div class="settings">' +
      (state.device === "phone" ? '<div class="list-head"><button class="icon-btn" data-act="screen" data-id="list" aria-label="Back">' + icon("back") + '</button><h1 class="list-title">Notifications</h1></div>' : '<h1 class="page-title">Notifications</h1>') +
      '<p class="muted">Choose where each kind of notice reaches you. Nothing is sent between 20:00 and 08:00.</p>' +
      groups
        .map(function (g) {
          const v = state.notify[g.id];
          return (
            '<section class="setting' + (g.isNew ? " is-new" : "") + '"><div class="setting-text"><h2>' + g.title + (g.isNew ? '<span class="new">New</span>' : "") + "</h2><p>" + g.hint + "</p></div>" +
            '<div class="seg" role="radiogroup" aria-label="' + g.title + '">' +
            [["phone", "Phone"], ["email", "Email"], ["app", "In the app only"]]
              .map(function (o) {
                return '<button role="radio" aria-checked="' + (v === o[0]) + '" data-act="notify" data-id="' + g.id + '" data-v="' + o[0] + '">' + o[1] + "</button>";
              })
              .join("") +
            "</div>" +
            (g.isNew
              ? '<div class="example"><span class="example-label">What you\'d get</span>' +
                '<div class="push">' + icon("chat") + "<span><b>3 new messages in Camera team</b>Jordan: Thanks Taylor. The spare plate is in the grey case.</span></div>" +
                '<p class="muted small">Email only if you have no phone alerts, at most one every 4 hours.</p>' +
                '<h3 class="mute-title">Mute a chat</h3>' +
                CHATS.filter(function (c) { return c.kind === "dept"; })
                  .map(function (c) {
                    const on = !state.muted[c.id];
                    return '<button class="mute-row" role="switch" aria-checked="' + on + '" data-act="mute" data-id="' + c.id + '">' + avatarFor(c) + "<span>" + esc(DEPTS[c.dept].name) + '</span><span class="switch"><span></span></span></button>';
                  })
                  .join("") +
                "</div>"
              : "") +
            "</section>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  // ---- App chrome: phone top bar and tabs, computer side bar ---------------------------------

  const TABS = [
    { id: "training", label: "Training", icon: "cap" },
    { id: "courses", label: "Courses", icon: "book" },
    { id: "schedule", label: "Schedule", icon: "calendar" },
    { id: "checklist", label: "Checklist", icon: "check" },
    { id: "sops", label: "SOPs", icon: "file" },
  ];
  const UNREAD = CHATS.reduce(function (n, c) { return n + c.unread; }, 0);

  function phoneTop(navOpt) {
    return (
      '<header class="app-top"><span class="brand"><span class="brand-mark">IFC</span><span>Production Academy</span></span>' +
      '<span class="top-actions">' +
      (navOpt === 1 ? '<button class="icon-btn msg-btn on" data-act="screen" data-id="list" aria-label="Messages, ' + UNREAD + ' unread">' + icon("chat") + '<span class="dot">' + UNREAD + "</span></button>" : "") +
      '<button class="icon-btn" aria-label="Notifications">' + icon("bell") + (navOpt === 3 ? '<span class="dot">' + UNREAD + "</span>" : "") + "</button>" +
      '<span class="me">AR</span></span></header>'
    );
  }

  function phoneTabs(navOpt) {
    let tabs = TABS.slice();
    if (navOpt === 2) {
      // Messages in the centre; Checklist and SOPs become Serve.
      tabs = [TABS[0], TABS[1], { id: "messages", label: "Messages", icon: "chat", current: true, count: UNREAD }, TABS[2], { id: "serve", label: "Serve", icon: "serve" }];
    }
    return (
      '<nav class="tabs" aria-label="Main">' +
      tabs
        .map(function (t) {
          return '<span class="tab' + (t.current ? " current" : "") + '">' + icon(t.icon) + (t.count ? '<span class="dot">' + t.count + "</span>" : "") + "<span>" + t.label + "</span></span>";
        })
        .join("") +
      "</nav>"
    );
  }

  function rail(navOpt) {
    const items = [
      { label: "Training", icon: "cap" },
      { label: "Courses", icon: "book" },
      { label: "Schedule", icon: "calendar" },
      { label: "Checklist", icon: "check" },
      { label: "SOPs", icon: "file" },
    ];
    if (navOpt === 1) items.splice(3, 0, { label: "Messages", icon: "chat", current: true, count: UNREAD });
    return (
      '<nav class="rail" aria-label="Main"><span class="brand-mark">IFC</span>' +
      items
        .map(function (t) {
          return '<span class="rail-item' + (t.current ? " current" : "") + '">' + icon(t.icon) + (t.count ? '<span class="dot">' + t.count + "</span>" : "") + "<span>" + t.label + "</span></span>";
        })
        .join("") +
      '<span class="rail-foot">' +
      (navOpt === 2 ? '<span class="rail-item current">' + icon("chat") + '<span class="dot">' + UNREAD + "</span><span>Messages</span></span>" : "") +
      '<span class="rail-item">' + icon("bell") + "<span>Alerts</span></span>" +
      '<span class="me">AR</span></span></nav>'
    );
  }

  // ---- Screens ------------------------------------------------------------------------------

  function phoneScreen() {
    const s = state.screen;
    let body;
    let chrome = true;
    if (s === "list") body = chatList();
    else if (s === "dm") { body = state.dmPicked ? dmThread(state.dmPicked) : dmPicker(); chrome = !state.dmPicked; }
    else if (s === "settings") body = settingsPage();
    else if (s === "group") { body = groupPicker(); chrome = false; }
    else { body = threadPane(); chrome = false; }
    return (
      '<div class="app phone">' +
      (chrome ? phoneTop(NAV_PHONE) : "") +
      '<main class="phone-body">' + body + "</main>" +
      (chrome ? phoneTabs(NAV_PHONE) : "") +
      viewer() +
      "</div>"
    );
  }

  function computerScreen() {
    const s = state.screen;
    let main;
    if (s === "settings") main = '<div class="page">' + settingsPage() + "</div>";
    else
      main =
        '<aside class="listpane">' + (s === "dm" ? dmPicker() : s === "group" ? groupPicker() : chatList()) + "</aside>" +
        '<div class="threadpane">' +
        (s === "dm" && !state.dmPicked
          ? '<div class="empty"><span class="empty-art">' + icon("compose") + "</span><h2>Choose someone to message</h2><p>Anyone in the Academy. Direct messages can be read by the Production Director and Platform Admins to keep everyone safe.</p></div>"
          : s === "group"
            ? '<div class="empty"><span class="empty-art">' + icon("users") + "</span><h2>A chat for a group</h2><p>Name it, then choose people or turn on Everyone in the Academy.</p></div>"
            : threadPane()) +
        "</div>";
    return '<div class="app computer">' + rail(NAV_COMPUTER) + main + viewer() + "</div>";
  }

  function navScreen() {
    const phones = [
      { n: 1, title: "1 · Beside the bell", text: "A Messages button with the unread count in the top bar. The five tabs stay as they are." },
      { n: 2, title: "2 · Centre tab (chosen)", text: "Checklist and SOPs become one Serve tab, and Messages sits in the middle of the bar." },
      { n: 3, title: "3 · In the bell panel", text: "The bell opens a panel with two tabs, Alerts and Messages. Fewest changes, but messages are one tap deeper." },
    ];
    const computers = [
      { n: 1, title: "A · In the side bar (chosen)", text: "Messages sits with the main items, after Schedule." },
      { n: 2, title: "B · Beside the bell", text: "Messages sits at the bottom of the side bar with the bell and your initials." },
    ];
    return (
      '<div class="nav-options">' +
      "<h1>Where Messages lives</h1><p class=\"muted\">The five phone tabs are full. Choose one for phones and one for computers. Click a card to pick it.</p>" +
      '<h2 class="section-label">On a phone</h2><div class="nav-grid">' +
      phones
        .map(function (o) {
          const inner =
            o.n === 3
              ? phoneTop(3) + '<div class="bell-panel"><div class="bell-tabs"><span>Alerts</span><span class="on">Messages <b>' + UNREAD + "</b></span></div>" +
                CHATS.slice(0, 3).map(chatRow).join("") + "</div>" + phoneTabs(3)
              : phoneTop(o.n) + '<div class="mini-body">' + CHATS.slice(0, 4).map(chatRow).join("") + "</div>" + phoneTabs(o.n);
          return (
            '<div class="nav-card' + (state.navPhone === o.n ? " picked" : "") + '" role="button" tabindex="0" aria-pressed="' + (state.navPhone === o.n) + '" data-act="nav-phone" data-id="' + o.n + '">' +
            '<div class="mini app phone" inert>' + inner + "</div>" +
            '<span class="nav-text"><b>' + o.title + "</b>" + o.text + "</span></div>"
          );
        })
        .join("") +
      '</div><h2 class="section-label">On a computer</h2><div class="nav-grid two">' +
      computers
        .map(function (o) {
          return (
            '<div class="nav-card' + (state.navComputer === o.n ? " picked" : "") + '" role="button" tabindex="0" aria-pressed="' + (state.navComputer === o.n) + '" data-act="nav-computer" data-id="' + o.n + '">' +
            '<div class="mini app computer" inert>' + rail(o.n) + '<div class="mini-list">' + CHATS.slice(0, 4).map(chatRow).join("") + "</div></div>" +
            '<span class="nav-text"><b>' + o.title + "</b>" + o.text + "</span></div>"
          );
        })
        .join("") +
      "</div></div>"
    );
  }

  // ---- Mock controls (not part of the design) ------------------------------------------------

  function controls() {
    return (
      '<div class="mock-bar">' +
      '<a class="mock-home" href="index.html">All options</a>' +
      '<strong class="mock-name">Option ' + OPTION.id + ": " + OPTION.name + "</strong>" +
      '<label class="mock-field">Screen <select data-input="screen">' +
      SCREENS.map(function (s) { return '<option value="' + s.id + '"' + (s.id === state.screen ? " selected" : "") + ">" + s.label + "</option>"; }).join("") +
      "</select></label>" +
      '<span class="mock-seg" role="group" aria-label="Device">' +
      ["phone", "computer"].map(function (d) { return '<button data-act="device" data-id="' + d + '" aria-pressed="' + (state.device === d) + '">' + (d === "phone" ? "Phone" : "Computer") + "</button>"; }).join("") +
      "</span>" +
      '<span class="mock-seg" role="group" aria-label="Theme">' +
      ["light", "dark"].map(function (t) { return '<button data-act="theme" data-id="' + t + '" aria-pressed="' + (state.theme === t) + '">' + (t === "light" ? "Light" : "Dark") + "</button>"; }).join("") +
      "</span>" +
      (state.screen === "states"
        ? '<span class="mock-seg" role="group" aria-label="State">' +
          ["empty", "offline"].map(function (t) { return '<button data-act="states" data-id="' + t + '" aria-pressed="' + (state.statesView === t) + '">' + (t === "empty" ? "Empty" : "Offline") + "</button>"; }).join("") +
          "</span>"
        : "") +
      "</div>" +
      '<p class="mock-hint">' + hint() + "</p>"
    );
  }

  function hint() {
    return {
      list: "Search, or open a chat. The pencil starts a direct message.",
      thread: "Tap a photo to open it. Leaders carry a Leader label.",
      compose: "Watch the photo shrink and upload. Press Send, or remove it.",
      viewer: "Step through the photos. Only the photo on screen loads at full size.",
      dm: "Search for someone and pick them. Note the safety line in direct messages.",
      leader: "You're a leader here. Use a message's menu to delete it, then confirm.",
      states: "Switch between a chat with no messages and being offline.",
      settings: "The new Messages group, with a choice of phone, email or the app only, and mute per chat.",
      group: "Leaders only. Name the group, then turn on Everyone in the Academy, or turn it off and choose people.",
      attach: "The + opens Photo, GIF and Document. Search for a GIF and pick one, or add a document and send it. Scroll up to see a shared PDF and a GIF.",
      nav: "Pick one phone and one computer option.",
    }[state.screen];
  }

  // ---- Render and events --------------------------------------------------------------------

  const root = document.getElementById("mock");
  function render() {
    const focusKey = document.activeElement && document.activeElement.getAttribute("data-input");
    const caret = focusKey ? document.activeElement.selectionStart : null;
    root.innerHTML =
      controls() +
      '<div class="stage" data-device="' + state.device + '">' +
      '<div class="frame ' + state.device + '" data-theme="' + state.theme + '">' +
      (state.screen === "nav" ? '<div class="app nav-page">' + navScreen() + "</div>" : state.device === "phone" ? phoneScreen() : computerScreen()) +
      "</div></div>";
    if (focusKey) {
      const el = root.querySelector('[data-input="' + focusKey + '"]');
      if (el && el.setSelectionRange) { el.focus(); el.setSelectionRange(caret, caret); }
    }
    const list = root.querySelector(".messages");
    if (list) list.scrollTop = list.scrollHeight;
  }

  root.addEventListener("click", function (e) {
    const t = e.target.closest("[data-act]");
    if (!t || t.disabled) return;
    const id = t.getAttribute("data-id");
    switch (t.getAttribute("data-act")) {
      case "screen": goScreen(id); return;
      case "device": state.device = id; break;
      case "theme": state.theme = id; break;
      case "states": state.statesView = id; break;
      case "open":
        state.chat = id;
        CHATS.find(function (c) { return c.id === id; }).unread = 0;
        if (state.screen === "list" || state.screen === "dm" || state.device === "phone") state.screen = "thread";
        break;
      case "back": state.screen = "list"; state.viewer = null; break;
      case "view": {
        const m = THREAD.find(function (x) { return x.id === id; });
        state.viewer = { photos: m.photos, index: Number(t.getAttribute("data-i")), from: m.from, time: m.time };
        break;
      }
      case "close-viewer": state.viewer = null; if (state.screen === "viewer") state.screen = "thread"; break;
      case "prev": state.viewer.index -= 1; break;
      case "next": state.viewer.index += 1; break;
      case "menu": state.menuFor = state.menuFor === id ? null : id; break;
      case "ask-delete": state.confirmFor = id; state.menuFor = null; break;
      case "cancel": state.confirmFor = null; break;
      case "delete": {
        const m = THREAD.find(function (x) { return x.id === id; });
        state.deleted[id] = m && m.from === "me" ? "self" : "leader";
        state.confirmFor = null;
        break;
      }
      case "attach": state.attachOpen = !state.attachOpen; state.gifOpen = false; break;
      case "open-gifs": state.attachOpen = false; state.gifOpen = true; state.gifQuery = ""; break;
      case "close-gifs": state.gifOpen = false; break;
      case "send-gif":
        state.sent.push({ gif: Number(id) });
        state.gifOpen = false;
        state.chat = "camera";
        if (state.screen !== "thread") state.screen = "thread";
        break;
      case "pick-doc": {
        state.attachOpen = false;
        state.docUpload = { progress: 0 };
        const docTimer = setInterval(function () {
          if (!state.docUpload) { clearInterval(docTimer); return; }
          state.docUpload.progress = Math.min(100, state.docUpload.progress + 20);
          if (state.docUpload.progress >= 100) clearInterval(docTimer);
          render();
        }, 200);
        break;
      }
      case "remove-doc": state.docUpload = null; break;
      case "pick-photo": state.attachOpen = false; state.screen = "compose"; state.compose.text = state.compose.text || ""; render(); startUpload(); return;
      case "remove-photo": clearInterval(uploadTimer); state.compose.stage = "idle"; break;
      case "pick-person": state.dmPicked = id; break;
      case "notify": state.notify[id] = t.getAttribute("data-v"); break;
      case "mute": state.muted[id] = !state.muted[id]; break;
      case "group-everyone": state.group.everyone = !state.group.everyone; break;
      case "group-pick": state.group.picked[id] = !state.group.picked[id]; break;
      case "group-create": {
        const g = state.group;
        const n = g.everyone ? 48 : Object.keys(g.picked).filter(function (k) { return g.picked[k]; }).length + 1;
        const chat = { id: "new-group", kind: "group", title: g.name.trim(), members: n, everyone: g.everyone, unread: 0, time: "Now", last: "You made this group", created: true };
        const at = CHATS.findIndex(function (c) { return c.id === "new-group"; });
        if (at >= 0) CHATS.splice(at, 1);
        CHATS.unshift(chat);
        state.chat = "new-group";
        state.screen = "thread";
        break;
      }
      case "nav-phone": state.navPhone = Number(id); break;
      case "nav-computer": state.navComputer = Number(id); break;
      default: return;
    }
    render();
  });

  root.addEventListener("input", function (e) {
    const key = e.target.getAttribute("data-input");
    if (key === "query") { state.query = e.target.value; render(); }
    if (key === "dmQuery") { state.dmQuery = e.target.value; render(); }
    if (key === "draft") state.compose.text = e.target.value;
    if (key === "groupName") { state.group.name = e.target.value; render(); }
    if (key === "gifQuery") { state.gifQuery = e.target.value; render(); }
  });

  root.addEventListener("change", function (e) {
    if (e.target.getAttribute("data-input") === "screen") goScreen(e.target.value);
  });

  root.addEventListener("submit", function (e) {
    e.preventDefault();
    const input = root.querySelector('[data-input="draft"]');
    const text = (input && input.value.trim()) || "";
    const photoReady = state.screen === "compose" && state.compose.stage === "ready";
    const docReady = state.docUpload && state.docUpload.progress >= 100;
    if ((!text && !photoReady && !docReady) || (state.screen === "states" && state.statesView === "offline")) return;
    const sent = {};
    if (text) sent.text = text;
    if (photoReady) sent.photos = [1];
    if (docReady) sent.doc = { name: "Sunday run sheet.pdf", kind: "PDF", size: "240 KB" };
    state.sent.push(sent);
    state.docUpload = null;
    state.compose = { stage: "idle", progress: 0, text: "" };
    state.chat = "camera";
    if (state.screen !== "thread") state.screen = "thread";
    render();
  });

  document.addEventListener("keydown", function (e) {
    const card = e.target.closest && e.target.closest('[role="button"][data-act]');
    if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); card.click(); return; }
    if (e.key !== "Escape") return;
    if (state.viewer) { state.viewer = null; if (state.screen === "viewer") state.screen = "thread"; render(); }
    else if (state.confirmFor || state.menuFor) { state.confirmFor = null; state.menuFor = null; render(); }
  });

  const start = new URLSearchParams(location.search);
  if (start.get("theme")) state.theme = start.get("theme");
  if (start.get("device")) state.device = start.get("device");
  goScreen(start.get("screen") || "list");
})();
