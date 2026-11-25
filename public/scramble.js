// Vervangt verborgen namen (HVF_VERBORGEN in spelers.js) door bewegende "gehackte" tekens.
(function () {
  var M = window.HVF_VERBORGEN, CH = "!<>-_\\/[]{}=+*^?#$%&@01ΣΞΔ¥§";
  if (!M || !document.createTreeWalker) return;
  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  function rnd(n) { var s = ""; for (var i = 0; i < n; i++) s += CH.charAt(Math.floor(Math.random() * CH.length)); return s; }
  var SKIP = { OPTION: 1, SELECT: 1, TEXTAREA: 1, SCRIPT: 1, STYLE: 1, TITLE: 1 };
  function convert(root) {
    if (!root || (root.nodeType !== 1 && root.nodeType !== 11)) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), list = [];
    while (w.nextNode()) { var n = w.currentNode; if (n.nodeValue.indexOf(M) >= 0 && n.parentNode && !SKIP[n.parentNode.nodeName]) list.push(n); }
    list.forEach(function (n) {
      var parts = n.nodeValue.split(M), frag = document.createDocumentFragment();
      parts.forEach(function (t, i) {
        if (i > 0) {
          var s = document.createElement("span");
          s.className = "scramble"; s.setAttribute("role", "img"); s.setAttribute("aria-label", "naam verborgen");
          s.appendChild(document.createTextNode(rnd(9)));
          frag.appendChild(s);
        }
        if (t) frag.appendChild(document.createTextNode(t));
      });
      n.parentNode.replaceChild(frag, n);
    });
  }
  convert(document.body);
  if (window.MutationObserver) {
    new MutationObserver(function (ms) {
      ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) convert(n); else if (n.nodeType === 3 && n.parentNode) convert(n.parentNode); }); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (!reduce) setInterval(function () {
    var els = document.querySelectorAll(".scramble");
    for (var i = 0; i < els.length; i++) {
      var t = els[i].firstChild; if (!t) continue;
      var a = t.nodeValue.split("");
      for (var k = 0; k < 3; k++) a[Math.floor(Math.random() * a.length)] = CH.charAt(Math.floor(Math.random() * CH.length));
      t.nodeValue = a.join("");
    }
  }, 90);
})();
