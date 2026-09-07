import type { KeyboardEvent } from "react";

/** Keyboard behavior for segmented buttons whose panels stay on this page.
 * Navigation links keep their native link behavior and do not use this helper. */
export function tabListKeyDown(event: KeyboardEvent<HTMLElement>) {
  const target=event.target;
  if(!(target instanceof HTMLElement))return;
  const current=target.closest<HTMLButtonElement>('button[role="tab"]');
  if(!current||current.closest('[role="tablist"]')!==event.currentTarget)return;
  const tabs=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="tab"]:not(:disabled)'))
    .filter(tab=>tab.closest('[role="tablist"]')===event.currentTarget);
  const index=tabs.indexOf(current);
  if(index<0||!tabs.length)return;
  const vertical=event.currentTarget.getAttribute("aria-orientation")==="vertical";
  const backwards=vertical?"ArrowUp":"ArrowLeft",forwards=vertical?"ArrowDown":"ArrowRight";
  let next:number;
  if(event.key==="Home")next=0;
  else if(event.key==="End")next=tabs.length-1;
  else if(event.key===backwards||event.key===forwards){
    const rtl=!vertical&&getComputedStyle(event.currentTarget).direction==="rtl";
    const step=(event.key===forwards?1:-1)*(rtl?-1:1);
    next=(index+step+tabs.length)%tabs.length;
  }else return;
  event.preventDefault();
  tabs[next].focus({preventScroll:true});
  tabs[next].click();
}
