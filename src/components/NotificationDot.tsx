"use client";
import { useEffect, useState } from "react";
import { hasNewNotifications } from "@/app/actions/notifications";
export function NotificationDot() {
  const [unread,setUnread]=useState(false);
  useEffect(()=>{
    let live=true;
    let version=0;
    const refresh=()=>{if(document.hidden)return;const request=++version;void hasNewNotifications().then(value=>{if(live&&request===version)setUnread(value);}).catch(()=>{});};
    const seen=()=>{version++;setUnread(false);};
    refresh();
    const timer=setInterval(refresh,60000);
    window.addEventListener("focus",refresh);
    window.addEventListener("fl-notifications-seen",seen);
    return ()=>{live=false;clearInterval(timer);window.removeEventListener("focus",refresh);window.removeEventListener("fl-notifications-seen",seen);};
  },[]);
  return unread?<span className="notification-unread-dot" aria-label="New notifications" role="status"/>:null;
}
