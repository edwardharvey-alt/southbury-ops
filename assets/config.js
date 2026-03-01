[...document.querySelectorAll("a,button")]
  .filter(x => (x.innerText || "").toLowerCase().includes("manage menu"))
  .map(x => ({ tag: x.tagName, href: x.getAttribute("href"), onclick: x.getAttribute("onclick") }));
