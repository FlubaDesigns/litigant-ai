import { useEffect } from "react";

interface PageMetaOptions {
  title: string;
  description?: string;
  canonicalPath?: string;
  jsonLd?: object | object[];
}

function setMeta(selector: string, attr: string, value: string) {
  let el = document.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    const [attrName, attrVal] = attr.split("=");
    el.setAttribute(attrName, attrVal);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
  return el;
}

function setOgTag(property: string, value: string) {
  return setMeta(`meta[property="${property}"]`, `property=${property}`, value);
}

function setNameTag(name: string, value: string) {
  return setMeta(`meta[name="${name}"]`, `name=${name}`, value);
}

function injectJsonLd(id: string, data: object | object[]) {
  let script = document.getElementById(id) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = id;
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(Array.isArray(data) ? data : data);
}

function removeJsonLd(id: string) {
  document.getElementById(id)?.remove();
}

export function usePageMeta({ title, description, canonicalPath, jsonLd }: PageMetaOptions) {
  useEffect(() => {
    const BASE_URL = "https://litigant-ai.com";
    const prevTitle = document.title;
    document.title = title;

    const prevDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? "";
    const prevOgTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content ?? "";
    const prevOgDesc = document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content ?? "";
    const prevOgUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content ?? "";
    const prevTwTitle = document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.content ?? "";
    const prevTwDesc = document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]')?.content ?? "";

    if (description) {
      setNameTag("description", description);
      setOgTag("og:title", title);
      setOgTag("og:description", description);
      setNameTag("twitter:title", title);
      setNameTag("twitter:description", description);
    }

    if (canonicalPath) {
      setOgTag("og:url", `${BASE_URL}${canonicalPath}`);
      let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = `${BASE_URL}${canonicalPath}`;
    }

    const JSON_LD_ID = "page-json-ld";
    if (jsonLd) {
      injectJsonLd(JSON_LD_ID, jsonLd);
    }

    return () => {
      document.title = prevTitle;
      if (description) {
        setNameTag("description", prevDesc);
        setOgTag("og:title", prevOgTitle);
        setOgTag("og:description", prevOgDesc);
        setNameTag("twitter:title", prevTwTitle);
        setNameTag("twitter:description", prevTwDesc);
      }
      if (canonicalPath) {
        setOgTag("og:url", prevOgUrl);
      }
      if (jsonLd) {
        removeJsonLd(JSON_LD_ID);
      }
    };
  }, [title, description, canonicalPath, jsonLd]);
}
