let altParent = null;

const cleanup = function () {
  __guard__($$.C("contextmenu_menu")[0], (x) => x.remove());
  if (altParent) {
    altParent.removeClass("has_contextmenu");
    altParent.$(".popup.has_contextmenu").removeClass("has_contextmenu");
    altParent.emit(new Event("contextmenu_removed"));
    altParent = null;
  }
};

const eventFn = function (e) {
  if (
    (e.target != null ? e.target.hasClass("contextmenu_menu") : undefined) ||
    __guard__(e.target != null ? e.target.parent() : undefined, (x) =>
      x.hasClass("contextmenu_menu")
    )
  ) {
    return;
  }
  cleanup();
};

const doc = document.documentElement;
doc.on("keydown", function ({ key }) {
  if (key === "Escape") {
    cleanup();
  }
});
doc.on("mousedown", eventFn);
doc.on("contextmenu", eventFn);

window.on("blur", function () {
  cleanup();
});

const ContextMenu = function ($menu, x, y, $parent = null) {
  cleanup();

  $menu.addClass("contextmenu_menu");
  $menu.style.position = "fixed";
  const menuWidth = $menu.offsetWidth;
  $menu.style.left = `${x}px`;
  $menu.style.top = `${y}px`;
  if ($parent) {
    altParent = $parent;
    altParent.addClass("has_contextmenu");
  }

  if (window.innerWidth < $menu.offsetLeft + menuWidth) {
    $menu.style.left = null;
    $menu.style.right = "1px";
  }
  if (window.innerHeight < $menu.offsetTop + $menu.offsetHeight) {
    $menu.style.top = `${Math.max($menu.offsetTop - $menu.offsetHeight, 0)}px`;
  }
};

ContextMenu.remove = function () {
  cleanup();
};

export default ContextMenu;

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
