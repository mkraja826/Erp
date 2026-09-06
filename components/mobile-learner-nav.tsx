"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const privatePrefixes=["/dashboard","/courses","/work-lab","/skills","/job-readiness","/assessment","/procurement-flow","/inventory","/documents","/accounting-impact"];
const items=[
  {href:"/dashboard",label:"Home",icon:"⌂"},
  {href:"/courses/sap-mm-level-1",label:"Learn",icon:"▤"},
  {href:"/work-lab/inbox",label:"Inbox",icon:"▣"},
  {href:"/skills",label:"Skills",icon:"◇"},
  {href:"/work-lab/final-certification",label:"Certify",icon:"✓"},
];

function matches(pathname:string,href:string){
  if(href==="/dashboard")return pathname==="/dashboard";
  if(href.startsWith("/courses"))return pathname.startsWith("/courses");
  if(href==="/work-lab/inbox")return pathname.startsWith("/work-lab")&&!pathname.includes("final-certification");
  if(href==="/skills")return pathname.startsWith("/skills")||pathname.includes("manager-review");
  if(href.includes("final-certification"))return pathname.includes("final-certification");
  return pathname.startsWith(href);
}

export default function MobileLearnerNav(){
  const pathname=usePathname();
  const show=privatePrefixes.some(prefix=>pathname===prefix||pathname.startsWith(`${prefix}/`));
  if(!show)return null;
  return <nav className="mobileLearnerNav" aria-label="Learner navigation">
    <div className="mobileLearnerNavInner">
      {items.map(item=>{
        const active=matches(pathname,item.href);
        return <Link key={item.href} href={item.href} className={active?"mobileLearnerNavItem active":"mobileLearnerNavItem"} aria-current={active?"page":undefined}>
          <span className="mobileLearnerNavIcon" aria-hidden="true">{item.icon}</span>
          <span>{item.label}</span>
        </Link>;
      })}
    </div>
  </nav>;
}
