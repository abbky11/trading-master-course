(function () {
  "use strict";

  var C = window.APP_CONFIG || {};
  var app = document.getElementById("app");
  var navEl = document.getElementById("nav");

  // ---------- chhote madad ke functions ----------

  // Safe DOM banane wala: user ka text hamesha textContent se jata hai, isliye XSS nahin.
  function h(tag, attrs) {
    var el = document.createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "class") el.className = v;
      else if (k.indexOf("on") === 0) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, kid) {
    if (kid === null || kid === undefined || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { append(el, k); }); return; }
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  function rupees(n) { return "₹" + new Intl.NumberFormat("en-IN").format(n || 0); }
  function setMsg(el, text, kind) {
    el.textContent = text || "";
    el.className = "msg" + (kind ? " " + kind : "");
  }
  function errorBox(text) { return h("p", { class: "msg err pad page" }, text); }
  function store(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* ignore */ } }
  function fetchStored(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function dropStored(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }

  var CANDLES =
    '<svg class="candles" width="260" height="84" viewBox="0 0 260 84" aria-hidden="true"><g stroke-width="2">' +
    '<line x1="15" y1="40" x2="15" y2="76" stroke="#B42318"/><rect x="10" y="46" width="10" height="20" fill="#B42318"/>' +
    '<line x1="35" y1="34" x2="35" y2="68" stroke="#1B7F55"/><rect x="30" y="38" width="10" height="18" fill="#1B7F55"/>' +
    '<line x1="55" y1="28" x2="55" y2="62" stroke="#1B7F55"/><rect x="50" y="32" width="10" height="16" fill="#1B7F55"/>' +
    '<line x1="75" y1="30" x2="75" y2="58" stroke="#B42318"/><rect x="70" y="34" width="10" height="14" fill="#B42318"/>' +
    '<line x1="95" y1="36" x2="95" y2="66" stroke="#B42318"/><rect x="90" y="42" width="10" height="16" fill="#B42318"/>' +
    '<line x1="115" y1="30" x2="115" y2="64" stroke="#1B7F55"/><rect x="110" y="36" width="10" height="20" fill="#1B7F55"/>' +
    '<line x1="135" y1="22" x2="135" y2="56" stroke="#1B7F55"/><rect x="130" y="26" width="10" height="22" fill="#1B7F55"/>' +
    '<line x1="155" y1="18" x2="155" y2="48" stroke="#1B7F55"/><rect x="150" y="22" width="10" height="18" fill="#1B7F55"/>' +
    '<line x1="175" y1="20" x2="175" y2="52" stroke="#B42318"/><rect x="170" y="26" width="10" height="18" fill="#B42318"/>' +
    '<line x1="195" y1="26" x2="195" y2="58" stroke="#1B7F55"/><rect x="190" y="30" width="10" height="20" fill="#1B7F55"/>' +
    '<line x1="215" y1="14" x2="215" y2="44" stroke="#1B7F55"/><rect x="210" y="18" width="10" height="18" fill="#1B7F55"/>' +
    '<line x1="235" y1="10" x2="235" y2="38" stroke="#1B7F55"/><rect x="230" y="14" width="10" height="16" fill="#1B7F55"/>' +
    '</g><line x1="0" y1="80" x2="260" y2="80" stroke="#DCDFD6" stroke-width="2"/></svg>';

  // YouTube link se 11 akshar ki video id nikalta hai (sirf yahi iframe mein jati hai)
  function youtubeId(input) {
    var s = String(input || "").trim();
    var ID = /^[A-Za-z0-9_-]{11}$/;
    if (ID.test(s)) return s;
    var u;
    try { u = new URL(s); } catch (e) { return null; }
    var host = u.hostname.replace(/^www\./, "");
    var id = null;
    if (host === "youtu.be") {
      id = u.pathname.slice(1).split("/")[0];
    } else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else {
        var m = u.pathname.match(/^\/(embed|live|shorts)\/([^/?]+)/);
        if (m) id = m[2];
      }
    }
    return id && ID.test(id) ? id : null;
  }

  // ---------- config ki jaanch ----------

  if (!C.SUPABASE_URL || String(C.SUPABASE_URL).indexOf("PASTE") === 0 ||
      !C.SUPABASE_ANON_KEY || String(C.SUPABASE_ANON_KEY).indexOf("PASTE") === 0) {
    app.replaceChildren(errorBox("Setup baaki hai: config.js mein Supabase ka URL aur anon key bhariye."));
    return;
  }
  if (!window.supabase) {
    app.replaceChildren(errorBox("Internet ya Supabase library load nahin hui. Page refresh kijiye."));
    return;
  }

  var sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
    auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
  });

  var state = { session: null, profile: null, paid: false, authError: "" };
  var memRef = null;

  if (C.CONTACT_EMAIL) document.getElementById("contact").textContent = C.CONTACT_EMAIL;

  // ---------- referral code ----------

  function captureRef(params) {
    var r = params.get("ref");
    if (r && /^[A-Za-z0-9]{4,16}$/.test(r)) {
      memRef = r.toUpperCase();
      store("ref", memRef);
    }
  }
  function getRef() { return memRef || fetchStored("ref"); }

  // ---------- user ka haal ----------

  async function loadUser() {
    var res = await sb.auth.getSession();
    var session = res.data && res.data.session;
    state.session = session || null;
    state.profile = null;
    state.paid = false;
    if (!session) return;

    var ref = getRef();
    if (ref) {
      var claim = await sb.rpc("claim_referral", { p_code: ref });
      if (!claim.error) { dropStored("ref"); memRef = null; }
    }

    var p = await sb.from("profiles").select("email, role, ref_code").eq("id", session.user.id).maybeSingle();
    state.profile = p.data || null;
    var pu = await sb.from("purchases").select("status").eq("user_id", session.user.id).maybeSingle();
    state.paid = !!(pu.data && pu.data.status === "paid");
  }

  async function fnError(error) {
    try {
      var body = await error.context.json();
      if (body && body.error) return body.error;
    } catch (e) { /* ignore */ }
    return "Server se jawab nahin mila. Thodi der baad koshish kijiye.";
  }

  // ---------- routing ----------

  var routeToken = 0;
  var routes = {
    "/": viewHome, "/login": viewLogin, "/watch": viewWatch, "/admin": viewAdmin, "/referral": viewReferral
  };

  function go(path) {
    var target = "#" + path;
    if (location.hash === target || (path === "/" && !location.hash)) route();
    else location.hash = target;
  }

  async function route() {
    var my = ++routeToken;
    var path = location.hash.replace(/^#/, "") || "/";
    var view = routes[path] || viewHome;
    renderNav();
    app.replaceChildren(h("p", { class: "loading pad" }, "Load ho raha hai..."));
    var node;
    try {
      node = await view();
    } catch (e) {
      console.error(e);
      node = errorBox("Kuch gadbad ho gayi. Page refresh kijiye.");
    }
    if (my !== routeToken) return;
    app.replaceChildren(node);
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  function renderNav() {
    var items = [];
    var role = state.profile && state.profile.role;
    if (state.session) {
      if (state.paid || role === "main_admin") items.push(h("a", { href: "#/watch" }, "Mere videos"));
      if (role === "main_admin") items.push(h("a", { href: "#/admin" }, "Admin panel"));
      if (role === "referral_admin") items.push(h("a", { href: "#/referral" }, "Referral panel"));
      items.push(h("span", { class: "who" }, (state.profile && state.profile.email) || state.session.user.email || ""));
      items.push(h("button", { class: "link", type: "button", onclick: logout }, "Logout"));
    } else {
      items.push(h("a", { href: "#/login" }, "Login"));
    }
    navEl.replaceChildren.apply(navEl, items);
  }

  async function logout() {
    await sb.auth.signOut();
    state.session = null; state.profile = null; state.paid = false;
    go("/");
  }

  // ---------- Home ----------

  async function viewHome() {
    var t = await sb.rpc("video_titles");
    var titles = (t.data || []);

    var msg = h("p", { class: "msg", role: "status" });
    var buy = h("button", { class: "btn btn-dark btn-block", type: "button" },
      state.paid ? "Videos dekhiye" : "Abhi kharidiye");
    buy.addEventListener("click", function () { buyNow(buy, msg); });

    var lessons = titles.length
      ? h("div", { class: "lessons" }, titles.map(function (v, i) {
          return h("div", { class: "lesson" }, h("span", { class: "n" }, String(i + 1)), h("span", { class: "t" }, v.title));
        }))
      : h("p", { class: "muted" }, "Videos jald hi yahan dikhenge.");

    var art = h("div", { class: "lead" });
    art.innerHTML = CANDLES; // sthir (static) string, user ka data nahin

    return h("div", {},
      h("section", { class: "hero pad" },
        h("div", { class: "hero-copy" },
          h("p", { class: "eyebrow" }, "Video course"),
          h("h1", {}, C.COURSE_NAME),
          h("p", { class: "lead" }, "Payment ke baad saare videos isi website par dekhiye. Alag app ya link ki zaroorat nahin."),
          art),
        h("div", { class: "card hero-card" },
          h("div", { class: "stack" },
            h("span", { class: "label-up" }, "Course ki fees"),
            h("span", { class: "price" }, rupees(C.PRICE_RUPEES)),
            h("span", { class: "muted" }, "Ek baar ka payment")),
          h("ul", { class: "ticks" },
            h("li", {}, "Saare videos isi website par"),
            h("li", {}, "Google se login, kisi bhi phone ya computer par")),
          buy,
          msg,
          h("p", { class: "muted small" }, "Referral link se aaye hain? Link apne aap pehchaan liya jayega."))),
      h("section", { class: "band pad" },
        h("h2", {}, "Course mein kaun se videos hain"),
        lessons),
      h("section", { class: "section pad" },
        h("h2", {}, "Videos kaise milenge"),
        h("div", { class: "steps" },
          step("1", "Google se login kijiye", "Apna saved email chuniye aur confirm kijiye."),
          step("2", rupees(C.PRICE_RUPEES) + " ka payment kijiye", "UPI, card ya netbanking se."),
          step("3", "Video turant dekhiye", "Payment pakka hote hi videos khul jayenge."))),
      h("div", { class: "pad" },
        h("p", { class: "risk" },
          "Trading mein risk hota hai aur nuksaan ho sakta hai. Yeh course sirf shiksha ke liye hai, nivesh ki salah nahin. Munafe ki koi guarantee nahin hai.")));
  }

  function step(n, title, text) {
    return h("div", { class: "step" },
      h("span", { class: "n" }, n), h("h3", {}, title), h("span", { class: "muted" }, text));
  }

  // ---------- Payment ----------

  async function buyNow(btn, msg) {
    if (!state.session) { go("/login"); return; }
    if (state.paid) { go("/watch"); return; }

    var label = btn.textContent;
    function reset() { btn.disabled = false; btn.textContent = label; }
    btn.disabled = true;
    btn.textContent = "Ruk jaiye...";
    setMsg(msg, "");

    try {
      if (!window.Razorpay) throw new Error("Payment system load nahin hua. Page refresh kijiye.");

      var res = await sb.functions.invoke("create-order", { body: {} });
      if (res.error) throw new Error(await fnError(res.error));
      var order = res.data;
      if (!order || !order.order_id) throw new Error("Payment shuru nahin ho paya.");

      var rz = new window.Razorpay({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency,
        name: C.COURSE_NAME,
        description: C.COURSE_NAME,
        prefill: { email: (state.profile && state.profile.email) || "" },
        theme: { color: "#101828" },
        handler: function (r) { confirmPayment(r, btn, msg); },
        modal: { ondismiss: reset }
      });
      rz.on("payment.failed", function () {
        setMsg(msg, "Payment nahin hua. Dobara koshish kijiye.", "err");
        reset();
      });
      rz.open();
    } catch (e) {
      setMsg(msg, e.message || "Kuch gadbad ho gayi.", "err");
      reset();
    }
  }

  async function confirmPayment(r, btn, msg) {
    btn.disabled = true;
    btn.textContent = "Payment pakka ho raha hai...";
    var res = await sb.functions.invoke("verify-payment", {
      body: {
        razorpay_order_id: r.razorpay_order_id,
        razorpay_payment_id: r.razorpay_payment_id,
        razorpay_signature: r.razorpay_signature
      }
    });
    if (res.error) {
      // Webhook peeche se bhi payment pakka kar deta hai, isliye thodi der mein check karte hain.
      setMsg(msg, "Payment ho gaya hai par abhi pakka nahin hua. Thodi der mein page refresh kijiye.", "err");
      btn.disabled = false;
      btn.textContent = "Videos dekhiye";
      return;
    }
    state.paid = true;
    go("/watch");
  }

  // ---------- Login ----------

  async function viewLogin() {
    if (state.session) { go("/"); return h("div"); }

    var msg = h("p", { class: "msg err", role: "alert" });
    if (state.authError) setMsg(msg, "Login nahin ho paya: " + state.authError, "err");

    var ref = getRef();
    var btn = h("button", { class: "btn btn-block", type: "button" },
      h("span", {}, "Google se jaari rakhiye"));
    btn.addEventListener("click", async function () {
      btn.disabled = true;
      var r = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: location.origin + location.pathname }
      });
      if (r.error) { setMsg(msg, r.error.message, "err"); btn.disabled = false; }
    });

    return h("main", { class: "page pad" },
      h("div", { class: "two" },
        h("div", { class: "card grow stack gap-l" },
          h("h1", { style: "font-size:34px" }, "Google se login kijiye"),
          ref ? h("p", { class: "notice" }, "Aap referral code ", h("strong", {}, ref), " se aaye hain. Yeh kharidari usi ke naam judegi.") : null,
          btn,
          msg,
          h("ol", { class: "numbered" },
            h("li", {}, "Button dabate hi aapke phone mein saved Google account dikhenge."),
            h("li", {}, "Apna email chuniye aur confirm kijiye."),
            h("li", {}, "Email ya password type karne ki zaroorat nahin.")),
          h("p", { class: "muted tiny" }, "Login sirf Google account se hota hai.")),
        h("div", { class: "side stack gap-m" },
          h("div", { class: "card stack gap-m" },
            h("span", { class: "label-up" }, "Aapka order"),
            h("div", { class: "stack gap-s" },
              h("span", { style: "font:800 22px/1.25 'Baloo 2','Hind',sans-serif" }, C.COURSE_NAME),
              h("span", { style: "font:800 32px 'Baloo 2','Hind',sans-serif" }, rupees(C.PRICE_RUPEES))),
            h("p", { class: "muted small" }, "Login ke baad payment ka step dikhega: UPI, card ya netbanking.")))));
  }

  // ---------- Videos dekhna ----------

  async function viewWatch() {
    if (!state.session) { go("/login"); return h("div"); }
    var role = state.profile && state.profile.role;
    if (!state.paid && role !== "main_admin") { go("/"); return h("div"); }

    var r = await sb.from("videos").select("id, title, youtube_id")
      .eq("is_visible", true).order("sort_order").order("created_at");
    if (r.error) return errorBox("Videos load nahin hue. Page refresh kijiye.");
    var videos = r.data || [];

    var head = h("div", { class: "two", style: "align-items:center;justify-content:space-between" },
      h("h1", { style: "font-size:34px" }, C.COURSE_NAME),
      state.paid ? h("span", { class: "pill pill-green" }, "Payment poora") : null);

    if (!videos.length) {
      return h("main", { class: "page pad" }, head,
        h("p", { class: "muted" }, "Abhi koi video nahin hai. Jald hi yahan dikhenge."));
    }

    var frame = h("iframe", {
      class: "player", title: "Course video", allowfullscreen: true,
      allow: "accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen",
      referrerpolicy: "strict-origin-when-cross-origin"
    });
    var title = h("h2", { style: "font-size:26px" });
    var buttons = [];

    function play(i) {
      var v = videos[i];
      frame.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(v.youtube_id) + "?rel=0&modestbranding=1";
      title.textContent = v.title;
      buttons.forEach(function (b, j) { b.className = "vitem" + (j === i ? " on" : ""); });
    }

    buttons = videos.map(function (v, i) {
      var b = h("button", { class: "vitem", type: "button" },
        h("span", { class: "n" }, String(i + 1)), h("span", { class: "t" }, v.title));
      b.addEventListener("click", function () { play(i); });
      return b;
    });

    var node = h("main", { class: "page pad" }, head,
      h("div", { class: "watch" },
        h("div", { class: "watch-main" }, frame, title),
        h("div", { class: "watch-list" }, h("div", { class: "head" }, "Saare paath"), buttons)));
    play(0);
    return node;
  }

  // ---------- Referral panel ----------

  async function viewReferral() {
    if (!state.session) { go("/login"); return h("div"); }
    var role = state.profile && state.profile.role;
    if (role !== "referral_admin" && role !== "main_admin") { go("/"); return h("div"); }

    var r = await sb.rpc("my_referral_stats");
    if (r.error || !r.data || !r.data.length) return errorBox("Referral jaankari load nahin hui.");
    var s = r.data[0];
    var link = location.origin + location.pathname + "?ref=" + s.ref_code;

    var input = h("input", { id: "reflink", type: "text", readonly: true, value: link });
    var copyMsg = h("p", { class: "msg ok", role: "status" });
    var copy = h("button", { class: "btn btn-dark btn-block", type: "button" }, "Link copy kijiye");
    copy.addEventListener("click", async function () {
      try {
        await navigator.clipboard.writeText(link);
        setMsg(copyMsg, "Link copy ho gaya.", "ok");
      } catch (e) {
        input.select();
        setMsg(copyMsg, "Link chuna gaya hai, ab copy kar lijiye.", "ok");
      }
    });

    return h("main", { class: "page pad" },
      h("div", { class: "stack gap-s" },
        h("h1", { style: "font-size:34px" }, "Referral panel"),
        h("span", { class: "pill pill-green", style: "align-self:flex-start" }, "Referral admin")),
      h("div", { class: "two" },
        h("section", { class: "card grow stack gap-m" },
          h("h2", { style: "font-size:28px" }, "Aapka referral link"),
          h("div", { class: "field" }, h("label", { for: "reflink" }, "Link"), input),
          copy, copyMsg,
          h("p", { class: "muted small" }, "Yeh link kisi ko bhi bhejiye. Jo bhi is link se aakar login karega, woh neeche ki ginti mein judta jayega.")),
        h("div", { class: "side stack gap-m" },
          h("section", { class: "stat" },
            h("span", { class: "muted small" }, "Aapke link se kitne log aaye"),
            h("span", { class: "num big" }, String(s.came))),
          h("section", { class: "stat" },
            h("span", { class: "muted small" }, "Kitne logon ne course kharida"),
            h("span", { class: "num big", style: "color:var(--green-dark)" }, String(s.bought))),
          h("p", { class: "muted tiny" }, "Commission aur payment ka hisaab sirf main admin dekhte hain."))));
  }

  // ---------- Main admin panel ----------

  async function viewAdmin() {
    if (!state.session) { go("/login"); return h("div"); }
    if (!state.profile || state.profile.role !== "main_admin") { go("/"); return h("div"); }

    var root = h("main", { class: "page pad" });

    async function load() {
      var res = await Promise.all([
        sb.rpc("admin_overview"),
        sb.rpc("admin_referrals"),
        sb.rpc("admin_candidates"),
        sb.from("videos").select("id, title, youtube_id, is_visible")
          .order("sort_order").order("created_at")
      ]);
      for (var i = 0; i < res.length; i++) {
        if (res[i].error) { root.replaceChildren(errorBox(res[i].error.message)); return; }
      }
      var ov = (res[0].data && res[0].data[0]) || { total_amount: 0, came: 0, bought: 0 };
      root.replaceChildren(
        h("div", { class: "stack gap-s" },
          h("h1", { style: "font-size:34px" }, "Admin panel"),
          h("span", { class: "pill pill-dark", style: "align-self:flex-start" }, "Main admin")),
        statsBlock(ov),
        referralsBlock(res[1].data || []),
        candidatesBlock(res[2].data || []),
        videosBlock(res[3].data || []));
    }

    function statTile(label, value, color) {
      return h("div", { class: "stat" },
        h("span", { class: "muted small" }, label),
        h("span", { class: "num", style: color ? "color:" + color : null }, value));
    }

    function statsBlock(ov) {
      return h("div", { class: "stats" },
        statTile("Kul kamaai", rupees(ov.total_amount)),
        statTile("Kitne log aaye", String(ov.came)),
        statTile("Course kharida", String(ov.bought), "var(--green-dark)"),
        statTile("Aaye par nahin kharida", String(Math.max(0, ov.came - ov.bought)), "var(--red)"));
    }

    function referralsBlock(rows) {
      var body = rows.length
        ? rows.map(function (r) {
            return h("tr", {},
              h("td", {}, r.email), h("td", {}, r.ref_code),
              h("td", { class: "r" }, String(r.came)), h("td", { class: "r" }, String(r.bought)),
              h("td", { class: "r" }, rupees(r.amount)));
          })
        : h("tr", {}, h("td", { colspan: "5", class: "muted" }, "Abhi koi referral admin nahin hai."));
      return h("section", { class: "block" },
        h("div", { class: "stack" },
          h("h2", { style: "font-size:28px" }, "Referral admin ka hisaab"),
          h("span", { class: "muted" }, "Har referral admin ke link se kitne aaye, kitne ne kharida aur kitni rakam bani. Commission aap khud haath se chukayenge.")),
        h("div", { class: "scroll" },
          h("table", {},
            h("thead", {}, h("tr", {},
              h("th", {}, "Email"), h("th", {}, "Referral code"),
              h("th", { class: "r" }, "Aaye"), h("th", { class: "r" }, "Kharida"), h("th", { class: "r" }, "Rakam"))),
            h("tbody", {}, body))));
    }

    function candidatesBlock(list) {
      var sec = h("section", { class: "block" });
      var pending = null;
      var busy = false;
      var note = h("p", { class: "msg", role: "status" });

      async function makeAdmin(id) {
        busy = true; draw();
        var r = await sb.rpc("admin_set_role", { p_user: id, p_role: "referral_admin" });
        if (r.error) { busy = false; pending = null; draw(); setMsg(note, r.error.message, "err"); return; }
        await load();
      }

      function draw() {
        var rows = list.length
          ? list.map(function (u) {
              if (pending === u.id) {
                return h("div", { class: "item ask" },
                  h("span", { class: "grow", style: "font-weight:500" }, u.email),
                  h("div", { class: "row-wrap", style: "align-items:center" },
                    h("span", { style: "flex:1 1 280px" }, "Kya aap " + u.email + " ko referral admin banana chahte hain?"),
                    h("button", { class: "btn btn-dark sm", type: "button", disabled: busy, onclick: function () { makeAdmin(u.id); } }, "Haan, banaiye"),
                    h("button", { class: "btn sm", type: "button", disabled: busy, onclick: function () { pending = null; draw(); } }, "Nahin")));
              }
              return h("div", { class: "item" },
                h("span", { class: "grow", style: "font-weight:500" }, u.email),
                h("button", { class: "btn sm", type: "button", onclick: function () { pending = u.id; setMsg(note, ""); draw(); } }, "Referral admin banaiye"));
            })
          : [h("div", { class: "item muted" }, "Abhi koi aur user nahin hai. Jab koi Google se login karega, yahan dikhega.")];
        sec.replaceChildren(
          h("div", { class: "stack" },
            h("h2", { style: "font-size:28px" }, "Referral admin banane ke liye"),
            h("span", { class: "muted" }, "Jo log Google se login karte hain, unke email yahan apne aap dikhte hain. Email aapko type nahin karna padta. Kisi ko admin banana ho to uske aage wala button dabaiye, phir confirm kijiye.")),
          h("div", { class: "list" }, rows),
          note);
      }
      draw();
      return sec;
    }

    function videosBlock(list) {
      var sec = h("section", { class: "block" });
      var note = h("p", { class: "msg", role: "status" });
      var nameIn = h("input", { id: "vname", type: "text", placeholder: "Jaise: Paath 6", maxlength: "200" });
      var linkIn = h("input", { id: "vlink", type: "text", placeholder: "https://youtu.be/..." });
      var addBtn = h("button", { class: "btn btn-dark", type: "button" }, "Video jodiye");

      addBtn.addEventListener("click", async function () {
        var name = nameIn.value.trim();
        var id = youtubeId(linkIn.value);
        if (!name) { setMsg(note, "Video ka naam likhiye.", "err"); return; }
        if (!id) { setMsg(note, "Yeh YouTube ka sahi link nahin lagta. Link dobara copy kijiye.", "err"); return; }
        addBtn.disabled = true;
        var r = await sb.from("videos").select("sort_order").order("sort_order", { ascending: false }).limit(1);
        var next = (r.data && r.data[0] ? r.data[0].sort_order : 0) + 1;
        var ins = await sb.from("videos").insert({ title: name, youtube_id: id, sort_order: next });
        if (ins.error) { setMsg(note, ins.error.message, "err"); addBtn.disabled = false; return; }
        await load();
      });

      async function toggle(v) {
        var r = await sb.from("videos").update({ is_visible: !v.is_visible }).eq("id", v.id);
        if (r.error) { setMsg(note, r.error.message, "err"); return; }
        await load();
      }
      async function remove(v) {
        if (!window.confirm("Is video ko hata dein? Yeh wapas nahin aayega.")) return;
        var r = await sb.from("videos").delete().eq("id", v.id);
        if (r.error) { setMsg(note, r.error.message, "err"); return; }
        await load();
      }

      var rows = list.length
        ? list.map(function (v, i) {
            return h("div", { class: "item" },
              h("span", { style: "flex:none;width:28px;font:800 20px 'Baloo 2','Hind',sans-serif;color:var(--ink-2)" }, String(i + 1)),
              h("div", { class: "grow stack" },
                h("span", { style: "font-weight:600" }, v.title),
                h("span", { class: "muted tiny" }, "https://youtu.be/" + v.youtube_id)),
              h("span", { class: "pill " + (v.is_visible ? "pill-green" : "pill-grey") }, v.is_visible ? "Dikh raha hai" : "Chhupa hua"),
              h("div", { class: "row-wrap" },
                h("button", { class: "btn sm", type: "button", onclick: function () { toggle(v); } }, v.is_visible ? "Chhupaiye" : "Dikhaiye"),
                h("button", { class: "btn btn-danger sm", type: "button", onclick: function () { remove(v); } }, "Hataiye")));
          })
        : [h("div", { class: "item muted" }, "Abhi koi video nahin hai. Upar se pehla video jodiye.")];

      sec.replaceChildren(
        h("div", { class: "stack" },
          h("h2", { style: "font-size:28px" }, "Course ke videos"),
          h("span", { class: "muted" }, "Yahan jo video jodenge, woh payment kar chuke graahakon ke video page par turant dikhega. Jab chahein chhupaiye ya hataiye.")),
        h("div", { class: "card stack gap-m", style: "padding:24px" },
          h("span", { style: "font-weight:600;font-size:19px" }, "Naya video jodiye"),
          h("div", { class: "form-row" },
            h("div", { class: "field f1" }, h("label", { for: "vname" }, "Video ka naam"), nameIn),
            h("div", { class: "field f2" }, h("label", { for: "vlink" }, "YouTube unlisted link"), linkIn),
            addBtn)),
        note,
        h("div", { class: "list" }, rows));
      return sec;
    }

    await load();
    return root;
  }

  // ---------- shuruaat ----------

  (async function init() {
    var params = new URLSearchParams(location.search);
    captureRef(params);
    state.authError = params.get("error_description") || "";
    try {
      await loadUser();
    } catch (e) {
      console.error(e);
    }
    if (params.has("code") || params.has("error") || params.has("error_description")) {
      history.replaceState(null, "", location.pathname + location.hash);
    }
    if (state.authError && !state.session) location.hash = "#/login";
    route();
  })();
})();
