import { Suspense } from 'react';
import type { Metadata } from 'next';
import frequencyMetadata from '@/data/bank-frequency/manifest.json';
import LoadingSkeleton from '@/components/loading-skeleton';
import FrequencyBrowser from './frequency-browser';

export const metadata: Metadata = { title: '题库词频统计 | JLPT Practice', description: '按等级、场次、题型与子题型查看 JLPT 题库单词、语法表达和接续表达的文本出现频率。' };
export default function FrequencyPage() {
  return <Suspense fallback={<LoadingSkeleton label="正在加载词频统计……" fullPage />}><FrequencyBrowser metadata={frequencyMetadata} /></Suspense>;
}
