import { type MessageToken, parseMessage } from "@chlen/chlib";

interface DecodedMessage {
  nameHtml: string;
  isNameAnchor: boolean;
  mailHtml: string;
  otherHtml: string;
  messageHtml: string;
}

const ALLOWED_NAME_TAG =
  /^<\/?(?:b|small|font(?:\s+color="?[#a-zA-Z0-9]+"?)?|span(?:\s+style="color:\s*[#a-zA-Z0-9]+;?")?)\s*>$/i;

interface DecodableRes {
  name: string;
  mail: string;
  other?: string;
  message?: string;
  trip?: string;
  id?: string;
  slip?: string;
  date?: string;
}

function renderMessageTokens(tokens: readonly MessageToken[]): string {
  return tokens
    .map((token) => {
      switch (token.type) {
        case "text":
        case "tag":
          return token.value;
        case "anchor": {
          const disabled = token.data.targetCount >= 25 || token.data.targetCount === 0;
          const disabledReason =
            token.data.targetCount >= 25
              ? "指定されたレスの量が極端に多いため、ポップアップを表示しません"
              : "指定されたレスが存在しません";

          // hrefの擬似JavaScript URLはホバー時にWebViewのリンク先表示へ出るため、操作はResBodyの委譲イベントに任せる。
          return `<a role="link" tabindex="0" class="anchor ${disabled ? "disabled" : ""}" ${
            disabled ? `data-disabled-reason="${disabledReason}"` : ""
          }>${token.value}</a>`;
        }
        case "id":
          return `<a role="link" tabindex="0" class="anchor_id">${token.value}</a>`;
        case "url":
          // 意図: URLの意味解析はchlibに任せ、リンク属性やCSSクラスはアプリ表示層で決める。
          return `<a href="${token.href}" target="_blank" rel="noopener noreferrer">${token.value}</a>`;
      }
    })
    .join("");
}

export default class MessageProcessor {
  static decode(res: DecodableRes, protocol: string): DecodedMessage {
    const parts = {} as DecodedMessage;

    let nameHtml = (res.name || "")
      .replace(/<\/?a[^>]*>/gi, "")
      // 名前欄の装飾は既存の b/small/font に加えて、色だけを指定する span を許可する。
      // 任意属性を通すと style/javascript の注入経路になるため、許可リストを狭く保つ。
      .replace(/<[^>]*>/g, (tag) => (ALLOWED_NAME_TAG.test(tag) ? tag : tag.replace("<", "&lt;")));

    if (res.trip) {
      nameHtml = nameHtml.replace(res.trip, `<span class="trip">${res.trip}</span>`);
    }
    parts.nameHtml = nameHtml;

    parts.isNameAnchor =
      /^\s*(?:&gt;|\uff1e){0,2}([\d\uff10-\uff19]+(?:[-\u30fc][\d\uff10-\uff19]+)?(?:\s*,\s*[\d\uff10-\uff19]+(?:[-\u30fc][\d\uff10-\uff19]+)?)*)\s*$/.test(
        res.name || "",
      );

    parts.mailHtml = (res.mail || "").replace(/<.*?(?:>|$)/g, "");

    let otherHtml = res.other || "";
    if (res.id) {
      // 意図: 受け取るID文字列が "ID:xxxx" / "xxxx" のどちらでも二重プレフィックスを防ぐ。
      const normalizedId = res.id.replace(/^ID:/i, "");
      const idHtml = `<span class="id">ID:${normalizedId}</span>`;
      if (res.slip) {
        const slipHtml = `<span class="slip">SLIP:${res.slip}</span>`;
        const searchId = `ID:${normalizedId}`;
        if (otherHtml.includes(searchId)) {
          otherHtml = otherHtml.replace(searchId, slipHtml + idHtml);
        } else {
          if (otherHtml.includes(normalizedId)) {
            otherHtml = otherHtml.replace(normalizedId, idHtml);
          } else if (otherHtml.includes(res.id)) {
            otherHtml = otherHtml.replace(res.id, idHtml);
          }
          if (!otherHtml.includes(slipHtml)) {
            otherHtml += slipHtml;
          }
        }
      } else {
        const searchId = `ID:${normalizedId}`;
        if (otherHtml.includes(searchId)) {
          otherHtml = otherHtml.replace(searchId, idHtml);
        } else if (otherHtml.includes(normalizedId)) {
          otherHtml = otherHtml.replace(normalizedId, idHtml);
        } else if (otherHtml.includes(res.id)) {
          otherHtml = otherHtml.replace(res.id, idHtml);
        }
      }
    } else if (res.slip) {
      otherHtml += `<span class="slip">SLIP:${res.slip}</span>`;
    }

    if (res.date) {
      otherHtml = otherHtml.replace(res.date, `<time class="date">${res.date}</time>`);
    }
    parts.otherHtml = otherHtml;

    // 本文の意味解析は共有ライブラリに集約し、ここではアプリ固有のHTML表示だけを担当する。
    parts.messageHtml = renderMessageTokens(
      parseMessage(res.message || "", {
        protocol,
      }),
    );

    return parts;
  }
}
