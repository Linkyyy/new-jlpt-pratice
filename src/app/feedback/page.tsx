import type { Metadata } from "next";
import FeedbackReview from "./feedback-review";

export const metadata: Metadata = { title: "题目反馈 | JLPT Practice", robots: { index: false, follow: false } };
export default function FeedbackPage() { return <FeedbackReview />; }
