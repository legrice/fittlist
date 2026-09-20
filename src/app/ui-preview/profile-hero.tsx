"use client";
import DetailHeader from "./detail-header";
import styles from "./preview.module.css";
export default function ProfileHero({type,name,id,banner,photo,category,onBack}:{type:"Person"|"Studio"|"Group";name:string;id?:string;banner?:string|null;photo?:string|null;category?:string;onBack:()=>void}) {
 return <div className={styles.profileHero}><div className={styles.profileBanner}>{banner&&<img src={banner} alt=""/>}<div className={styles.profileOverlayNav}><DetailHeader type={type} name={name} id={id} onBack={onBack}/></div>{category&&<span className={styles.profileBannerCategory}>{category}</span>}</div><div className={styles.profileHeroAvatar}>{photo?<img src={photo} alt={`${name} profile`}/>:<span>{name.split(" ").map(word=>word[0]).slice(0,2).join("")}</span>}</div></div>;
}
