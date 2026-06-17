import { useEffect } from "react";

export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;

    let metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    let prevDesc = metaDesc?.content ?? "";
    if (description) {
      if (!metaDesc) {
        metaDesc = document.createElement("meta");
        metaDesc.name = "description";
        document.head.appendChild(metaDesc);
      }
      metaDesc.content = description;
    }

    return () => {
      document.title = prev;
      if (metaDesc && prevDesc) metaDesc.content = prevDesc;
    };
  }, [title, description]);
}
