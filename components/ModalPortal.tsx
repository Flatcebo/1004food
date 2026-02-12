"use client";

import {useEffect, useState} from "react";
import {createPortal} from "react-dom";

const MODAL_ROOT_ID = "modal-root";

function getModalContainer(): HTMLElement | null {
  if (typeof window === "undefined") return null;
  // iframe 내부일 때: 부모 창의 modal-root 사용 (전체 레이아웃 최상단에 표시)
  const doc = window.self !== window.top ? window.parent.document : document;
  return doc.getElementById(MODAL_ROOT_ID) || doc.body;
}

export default function ModalPortal({children}: {children: React.ReactNode}) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setContainer(getModalContainer());
  }, []);

  if (!container) return null;
  return createPortal(children, container);
}
