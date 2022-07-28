const _TIMING = {
  duration: 250,
  easing: "ease-in-out"
};
const _FADE_IN_FRAMES =
  {opacity: [0, 1]};
const _FADE_OUT_FRAMES =
  {opacity: [1, 0]};
const _INVALIDED_EVENT = new Event("invalided");

const _getOriginHeight = function(ele) {
  const e = ele.cloneNode(true);
  e.style.cssText = `\
contain: content;
height: auto;
position: absolute;
visibility: hidden;
display: block;\
`;
  document.body.appendChild(e);
  const height = e.clientHeight;
  e.remove();
  return height;
};

const _animatingMap = new WeakMap();
const _resetAnimatingMap = function(ele) {
  __guard__(_animatingMap.get(ele), x => x.emit(_INVALIDED_EVENT));
};

export var fadeIn = async function(ele) {
  await app.waitAF();
  _resetAnimatingMap(ele);
  ele.removeClass("hidden");

  const ani = ele.animate(_FADE_IN_FRAMES, _TIMING);
  _animatingMap.set(ele, ani);

  ani.on("finish", function() {
    _animatingMap.delete(ele);
  }
  , {once: true});
  return ani;
};

export var fadeOut = function(ele) {
  _resetAnimatingMap(ele);
  const ani = ele.animate(_FADE_OUT_FRAMES, _TIMING);
  _animatingMap.set(ele, ani);

  let invalided = false;
  ani.on("invalided", function() {
    invalided = true;
  }
  , {once: true});
  ani.on("finish", async function() {
    if (!invalided) {
      await app.waitAF();
      ele.addClass("hidden");
      _animatingMap.delete(ele);
    }
  }
  , {once: true});
  return Promise.resolve(ani);
};

export var slideDown = async function(ele) {
  await app.waitAF();
  const h = _getOriginHeight(ele);

  _resetAnimatingMap(ele);
  ele.removeClass("hidden");

  const ani = ele.animate({ height: ["0px", `${h}px`] }, _TIMING);
  _animatingMap.set(ele, ani);

  ani.on("finish", function() {
    _animatingMap.delete(ele);
  }
  , {once: true});
  return ani;
};

export var slideUp = async function(ele) {
  await app.waitAF();
  const h = ele.clientHeight;

  _resetAnimatingMap(ele);
  // Firefoxでアニメーションが終了してから
  // .hiddenが付加されるまで時間がかかってチラつくため
  // heightであらかじめ消す(animateで上書きされる)
  ele.style.height = "0px";
  const ani = ele.animate({ height: [`${h}px`, "0px"] }, _TIMING);
  _animatingMap.set(ele, ani);

  let invalided = false;
  ani.on("invalided", function() {
    invalided = true;
  }
  , {once: true});
  ani.on("finish", async function() {
    if (!invalided) {
      await app.waitAF();
      ele.addClass("hidden");
      ele.style.height = null;
      _animatingMap.delete(ele);
    }
  }
  , {once: true});
  return ani;
};

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}
