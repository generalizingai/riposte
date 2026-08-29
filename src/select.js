// A themed dropdown. The native <select> stays in the DOM and remains the single
// source of truth for the value, so every existing read/write of `.value` keeps
// working; this only replaces what the user sees and clicks.
//
// The menu is position:fixed rather than absolute because the panel clips its own
// overflow to keep its rounded corners, and an absolute menu would be cut off.

const CHEVRON = `<svg class="riposte-select-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function enhanceSelect(select) {
  if (select.dataset.enhanced) return null;
  select.dataset.enhanced = "1";

  const wrap = document.createElement("div");
  wrap.className = "riposte-select";
  select.parentNode.insertBefore(wrap, select);
  wrap.append(select);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "riposte-select-btn";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = `<span class="riposte-select-label"></span>${CHEVRON}`;
  const label = button.querySelector(".riposte-select-label");

  const menu = document.createElement("div");
  menu.className = "riposte-select-menu";
  menu.setAttribute("role", "listbox");

  wrap.append(button, menu);

  let items = [];
  let active = -1;

  function build() {
    menu.textContent = "";
    items = [...select.options].map((option, i) => {
      const item = document.createElement("div");
      item.className = "riposte-select-option";
      item.setAttribute("role", "option");
      item.textContent = option.textContent;
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        choose(i);
      });
      item.addEventListener("mouseenter", () => setActive(i));
      menu.append(item);
      return item;
    });
  }

  function sync() {
    label.textContent = select.options[select.selectedIndex]?.textContent || "";
    items.forEach((item, i) => {
      const on = i === select.selectedIndex;
      item.dataset.selected = String(on);
      item.setAttribute("aria-selected", String(on));
    });
  }

  function setActive(i) {
    active = i;
    items.forEach((item, n) => (item.dataset.active = String(n === i)));
    items[i]?.scrollIntoView({ block: "nearest" });
  }

  function place() {
    const r = button.getBoundingClientRect();
    menu.style.minWidth = `${r.width}px`;
    menu.style.left = `${r.left}px`;
    menu.style.top = `${r.bottom + 4}px`;

    // Flip above the control when there is not enough room below it.
    const h = menu.offsetHeight;
    if (r.bottom + 4 + h > window.innerHeight - 8) {
      menu.style.top = `${Math.max(8, r.top - 4 - h)}px`;
    }
  }

  function open() {
    wrap.dataset.open = "true";
    button.setAttribute("aria-expanded", "true");
    place();
    setActive(select.selectedIndex);
  }

  function close() {
    wrap.dataset.open = "false";
    button.setAttribute("aria-expanded", "false");
  }

  function isOpen() {
    return wrap.dataset.open === "true";
  }

  function choose(i) {
    if (i < 0 || i >= select.options.length) return;
    select.selectedIndex = i;
    sync();
    close();
    button.focus();
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    isOpen() ? close() : open();
  });

  button.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen()) {
      event.stopPropagation(); // do not let the panel's Escape handler close the panel
      close();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      isOpen() ? choose(active) : open();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen()) return open();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((active + step + items.length) % items.length);
    }
  });

  button.addEventListener("blur", () => setTimeout(close, 0));

  // A fixed menu does not travel with a scrolling page, so close instead of chasing it.
  window.addEventListener("scroll", () => isOpen() && close(), true);
  window.addEventListener("resize", () => isOpen() && close());

  build();
  sync();

  return { sync, rebuild: () => (build(), sync()), wrap, button };
}

export function enhanceAll(root) {
  return [...root.querySelectorAll("select:not([data-enhanced])")].map(enhanceSelect);
}
