import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import React from "react";
import {
  useViewSurface,
  type ViewSurface,
  ViewSurfaceProvider,
} from "src/view/browser/hooks/use-view-surface";
import { afterEach, describe, expect, it } from "vite-plus/test";

const Probe: React.FC = () => {
  const surface = useViewSurface();
  return <output data-testid="surface-title">{surface.document.title}</output>;
};

describe("useViewSurface", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("Providerから注入された表示環境を返す", () => {
    const surface: ViewSurface = {
      window: { name: "detached" } as Window,
      document: { title: "別窓" } as Document,
    };

    render(
      <ViewSurfaceProvider surface={surface}>
        <Probe />
      </ViewSurfaceProvider>,
    );

    expect(screen.getByTestId("surface-title")).toHaveTextContent("別窓");
  });
});
