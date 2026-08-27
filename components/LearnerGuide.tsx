import styles from "./LearnerGuide.module.css";

type Props = {
  learning: string;
  now: string;
  next: string;
  learningDetail?: string;
  nowDetail?: string;
  nextDetail?: string;
  compact?: boolean;
};

export default function LearnerGuide({ learning, now, next, learningDetail, nowDetail, nextDetail, compact = false }: Props) {
  const items = [
    { label: "What you're learning", title: learning, detail: learningDetail },
    { label: "Do this now", title: now, detail: nowDetail, active: true },
    { label: "What happens next", title: next, detail: nextDetail },
  ];

  return <section className={`${styles.guide} ${compact ? styles.compact : ""}`} aria-label="Learning guidance">
    {items.map((item,index)=><div key={item.label} className={`${styles.step} ${item.active ? styles.active : ""}`}>
      <span className={styles.number}>{index+1}</span>
      <div className={styles.copy}><span className={styles.label}>{item.label}</span><strong>{item.title}</strong>{item.detail&&<span>{item.detail}</span>}</div>
    </div>)}
  </section>;
}
