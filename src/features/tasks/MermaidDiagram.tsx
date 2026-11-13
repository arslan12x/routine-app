"use client";

import { useEffect, useId, useState } from "react";

export default function MermaidDiagram({ chart }: { chart: string }) {
  const reactId = useId();
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const id = `study-diagram-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
        const { svg } = await mermaid.render(id, chart);
        if (active) setImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [chart, reactId]);

  if (failed) {
    return <pre className="my-4 overflow-x-auto rounded-xl bg-bg p-4 text-xs"><code>{chart}</code></pre>;
  }
  if (!image) {
    return <div className="my-4 h-40 animate-pulse rounded-xl bg-bg" role="status" aria-label="Rendering diagram" />;
  }

  return (
    <figure className="my-5 overflow-x-auto rounded-xl border border-border bg-bg p-3">
      {/* SVG is displayed as an image so generated markup cannot execute in the page context. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="AI-generated Mermaid flowchart" className="mx-auto h-auto max-w-full" />
    </figure>
  );
}
