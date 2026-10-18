import { describe, expect, it } from "vite-plus/test";

import {
  automationPresentationForText,
  clearDeliveredViews,
  deliveredViews,
  renderDeliveredMarkdown,
} from "../../../src/app/render/view-store.js";
import type { ViewDocument } from "../../../src/app/render/view.js";

function view(title: string): ViewDocument {
  return {
    title,
    meta: [`${title} meta`],
    sections: [],
    trailing: [],
    variant: "brief",
  };
}

describe("app/render/view-store", () => {
  it("resolves delivered Markdown to the remembered view", () => {
    clearDeliveredViews();
    const markdown = renderDeliveredMarkdown(view("已投递"));
    expect(automationPresentationForText(markdown, "subscriptions")).toMatchObject({
      kind: "subscriptions",
      meta: ["已投递 meta"],
      title: "已投递",
    });
    expect(deliveredViews()).toHaveLength(1);
    clearDeliveredViews();
    expect(deliveredViews()).toHaveLength(0);
  });

  it("falls back to decoding text the plugin never rendered", () => {
    clearDeliveredViews();
    const presentation = automationPresentationForText(
      "# 固定标题\n\n一条固定说明\n\n## 模型发布\n\n1. 新模型上线 [↗ #1](https://example.com/item)\n",
      "industry",
    );
    expect(presentation).toMatchObject({
      kind: "industry",
      meta: ["一条固定说明"],
      sections: [
        {
          id: "1-models",
          items: [{ headline: "新模型上线" }],
          title: "模型发布",
        },
      ],
      title: "固定标题",
    });
  });

  it("evicts the oldest view beyond the capacity of eight", () => {
    clearDeliveredViews();
    const markdowns = Array.from({ length: 10 }, (_, index) =>
      renderDeliveredMarkdown(view(`第 ${index} 期`)),
    );
    expect(deliveredViews()).toHaveLength(8);
    expect(deliveredViews().map(({ markdown }) => markdown)).toEqual(markdowns.slice(2));
    // Evicted text still presents, through the decode fallback.
    expect(automationPresentationForText(markdowns[0]!, "news").title).toBe("第 0 期");
    expect(automationPresentationForText(markdowns[2]!, "news").title).toBe("第 2 期");
    clearDeliveredViews();
  });
});
