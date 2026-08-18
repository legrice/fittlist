"use client";

import { useEffect, useState } from "react";
import { classDetail, type ClassDetail } from "@/app/actions/classdetail";
import { ClassPeek, peekFromDetail } from "@/components/ClassPeek";
import { Toast, useToast } from "@/components/Toast";

export function ClassPeekLoader({ base, classId, iso, onClose, onChanged }: { base:string; classId:string; iso:string; onClose:()=>void; onChanged:()=>void }) {
  const [detail,setDetail]=useState<ClassDetail|null>(null);
  const [toastMsg,toastOn,toast]=useToast();
  useEffect(()=>{let live=true;void classDetail(base.replace(/^s\//,""),classId,iso).then((result)=>{if(!live)return;if(result)setDetail(result);else{toast("That class isn't available");onClose();}});return()=>{live=false;};},[base,classId,iso,onClose,toast]);
  return <>{detail&&<ClassPeek cls={peekFromDetail(detail)} initialDetail={detail} onClose={onClose} onChanged={onChanged} onToast={toast}/>}<Toast msg={toastMsg} on={toastOn}/></>;
}
