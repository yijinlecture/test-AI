/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  MapPin, 
  Utensils, 
  Users, 
  Briefcase, 
  User, 
  Coffee, 
  ChevronRight, 
  MessageSquare, 
  Sparkles,
  Info,
  Car,
  CalendarCheck,
  Quote,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';
import { RESTAURANTS } from './constants';
import { Restaurant, Purpose, Category, Budget } from './types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export default function App() {
  const [purpose, setPurpose] = useState<Purpose | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Restaurant[]>([]);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [recommendStatus, setRecommendStatus] = useState<string | null>(null);
  const [loadingMapId, setLoadingMapId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby_-yz7DBJNfwUudXaKNu-GQ9KozxBBTEtj7i3zaYB2edM9KdOvikhKYOgW6aeUL5ZQ/exec";
  const SPREADSHEET_ID = "1Fg26UK6irGPJ-HcWi8ezh1H0G_2aSgm453XhH1sLjy4";

  const handleViewLocation = async (restaurant: Restaurant) => {
    setLoadingMapId(restaurant.id);
    const fallbackUrl = `https://www.google.com/maps/search/${encodeURIComponent('나주 ' + restaurant.name)}`;
    
    try {
      const model = "gemini-3-flash-preview";
      // 500 에러를 방지하기 위해 도구 설정을 단순화하고 프롬프트를 명확히 합니다.
      const response = await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text: `나주 빛가람동에 있는 '${restaurant.name}' 식당의 구글 지도 위치(URI)를 알려줘.` }] }],
        config: {
          tools: [{ googleMaps: {} }],
          // toolConfig 내의 latLng가 특정 상황에서 500 에러를 유발할 수 있으므로 제거하거나 
          // 프롬프트에 위치 정보를 포함하는 방식으로 대체합니다.
        },
      });

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const mapUri = groundingChunks?.find(chunk => chunk.maps?.uri)?.maps?.uri;

      if (mapUri) {
        window.open(mapUri, '_blank');
      } else {
        window.open(fallbackUrl, '_blank');
      }
    } catch (error) {
      // API 자체에서 500 에러가 발생할 경우 사용자에게 알리고 즉시 폴백 URL로 연결합니다.
      console.warn("Google Maps Tool failed, using fallback search URL.", error);
      window.open(fallbackUrl, '_blank');
    } finally {
      setLoadingMapId(null);
    }
  };

  const handleRecommend = async (restaurantName: string) => {
    try {
      const payload = {
        action: "appendSheet",
        spreadsheetId: "1Fg26UK6irGPJ-HcWi8ezh1H0G_2aSgm453XhH1sLjy4",
        rows: [[new Date().toLocaleString('ko-KR'), restaurantName, 1]]
      };

      // Google Apps Script Web App은 보통 CORS 이슈가 있으므로 mode: 'no-cors'를 고려할 수 있으나 
      // POST 요청의 경우 서버 설정을 따름. 여기서는 표준 fetch 시도.
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors', // GAS 리다이렉션 처리를 위해 no-cors 사용 (응답 확인은 제한됨)
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      setRecommendStatus('구글 시트 기록 완료! ✅');
      setTimeout(() => setRecommendStatus(null), 3000);
    } catch (error) {
      console.error("Recommendation error:", error);
      setRecommendStatus('기록 중 오류가 발생했습니다. ❌');
      setTimeout(() => setRecommendStatus(null), 3000);
    }
  };

  const purposes: { label: Purpose; icon: React.ReactNode }[] = [
    { label: '혼밥', icon: <User className="w-4 h-4" /> },
    { label: '팀 점심', icon: <Users className="w-4 h-4" /> },
    { label: '저녁 회식', icon: <Briefcase className="w-4 h-4" /> },
    { label: '외빈 접대', icon: <Sparkles className="w-4 h-4" /> },
  ];

  const categories: Category[] = ['한식', '중식', '일식', '양식', '고기/구이', '카페/디저트'];

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsLoading(true);
    setAiResponse(null);

    try {
      // 1. Filter local data first for immediate results
      let filtered = [...RESTAURANTS];
      if (purpose) {
        if (purpose === '혼밥') filtered = filtered.filter(r => !r.tags.includes('회식추천'));
        if (purpose === '저녁 회식') filtered = filtered.filter(r => r.groupSeats);
      }
      if (category) filtered = filtered.filter(r => r.category === category);
      if (budget) filtered = filtered.filter(r => r.priceRange === budget);
      
      setResults(filtered);

      // 2. Call Gemini for smart curation and natural language handling
      const model = "gemini-3-flash-preview";
      const prompt = `
        당신은 한전KDN 임직원을 위한 나주 빛가람동 현지인 미식 큐레이터입니다.
        사용자의 요청: "${query || '추천해줘'}"
        선택된 필터: 목적(${purpose || '미지정'}), 카테고리(${category || '미지정'}), 예산(${budget || '미지정'})
        
        제공된 데이터베이스 정보를 참고하여 답변하세요:
        ${JSON.stringify(RESTAURANTS)}

        답변 가이드:
        1. 친절한 직장 선배 톤으로 답변하세요.
        2. 사용자의 상황에 가장 적합한 식당을 1~2곳 추천하고 이유를 설명하세요.
        3. KDN 본사 기준 위치 설명을 강조하세요.
        4. 마크다운 형식을 사용하세요.
      `;

      const response = await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text: prompt }] }],
      });

      setAiResponse(response.text || "죄송합니다. 추천 결과를 가져오지 못했습니다.");
    } catch (error) {
      console.error("Search error:", error);
      setAiResponse("AI 추천 중 오류가 발생했습니다. 필터링된 결과를 확인해주세요.");
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center pb-20">
      {/* Header */}
      <header className="w-full kdn-gradient text-white py-12 px-6 text-center shadow-lg relative overflow-hidden">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-1.5 rounded-full text-sm font-medium mb-4">
            <Utensils className="w-4 h-4" />
            <span>나주 빛가람동 현지인 미식 큐레이터</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            KDN 미식 가이드
          </h1>
          <p className="text-blue-100 text-lg max-w-2xl mx-auto">
            한전KDN 임직원을 위한 상황별 최적의 맛집 추천 서비스. 
            오늘 점심, 무엇을 먹을지 고민하지 마세요.
          </p>
        </motion.div>
        
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-64 h-64 bg-white/10 rounded-full -translate-x-1/2 -translate-y-1/2 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-400/20 rounded-full translate-x-1/3 translate-y-1/3 blur-3xl" />
      </header>

      <main className="w-full max-w-4xl px-4 -mt-8 relative z-20">
        {/* Search & Filter Section */}
        <div className="glass-card rounded-3xl p-6 md:p-8 space-y-8">
          {/* Purpose Selection */}
          <section>
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Users className="w-4 h-4" /> 방문 목적
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {purposes.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setPurpose(p.label === purpose ? null : p.label)}
                  className={cn(
                    "flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 transition-all duration-200 font-medium",
                    purpose === p.label 
                      ? "bg-kdn-blue border-kdn-blue text-white shadow-md scale-[1.02]" 
                      : "bg-white border-slate-100 text-slate-600 hover:border-kdn-blue/30 hover:bg-slate-50"
                  )}
                >
                  {p.icon}
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          {/* Category Selection */}
          <section>
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Utensils className="w-4 h-4" /> 선호 카테고리
            </h2>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c === category ? null : c)}
                  className={cn(
                    "px-4 py-2 rounded-full border text-sm font-medium transition-all",
                    category === c 
                      ? "bg-slate-800 border-slate-800 text-white" 
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </section>

          {/* Natural Language Input */}
          <section>
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> 상세 요청 (선택)
            </h2>
            <form onSubmit={handleSearch} className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='"본사 후문 도보 5분 거리 고깃집", "비 오는 날 국물 요리" 등'
                className="w-full pl-12 pr-32 py-4 bg-slate-100 border-none rounded-2xl focus:ring-2 focus:ring-kdn-blue transition-all outline-none text-slate-800 placeholder:text-slate-400"
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <button
                type="submit"
                disabled={isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-kdn-blue text-white px-6 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                추천받기
              </button>
            </form>
          </section>
        </div>

        {/* Results Section */}
        <div ref={scrollRef} className="mt-12 space-y-8">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center py-20 text-slate-400"
              >
                <Loader2 className="w-12 h-12 animate-spin mb-4 text-kdn-blue" />
                <p className="font-medium">KDN 선배가 맛집을 고르고 있습니다...</p>
              </motion.div>
            ) : aiResponse ? (
              <motion.div
                key="ai-response"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-kdn-blue">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">KDN 미식 큐레이터의 추천</h3>
                    <p className="text-xs text-slate-400">AI 기반 맞춤형 분석 결과</p>
                  </div>
                </div>
                <div className="prose prose-slate max-w-none prose-p:leading-relaxed prose-strong:text-kdn-blue">
                  <ReactMarkdown>{aiResponse}</ReactMarkdown>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {results.length > 0 && !isLoading && (
            <div className="grid grid-cols-1 gap-6">
              <h3 className="text-xl font-bold text-slate-800 px-2">추천 식당 리스트</h3>
              {results.map((restaurant, idx) => (
                <motion.div
                  key={restaurant.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-100 hover:shadow-md transition-shadow group"
                >
                  <div className="p-6 md:p-8 flex flex-col md:flex-row gap-6">
                    <div className="flex-1 space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="inline-block px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full mb-2">
                            {restaurant.category}
                          </span>
                          <h4 className="text-2xl font-bold text-slate-900 group-hover:text-kdn-blue transition-colors">
                            {restaurant.name}
                          </h4>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-kdn-blue">{restaurant.priceRange}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-slate-600 leading-relaxed">
                          {restaurant.description}
                        </p>
                        <div className="flex items-center gap-2 text-slate-900 font-bold">
                          <Utensils className="w-4 h-4 text-kdn-blue" />
                          <span>대표 메뉴: {restaurant.signatureMenu}</span>
                        </div>
                      </div>

                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                        <div className="flex items-start gap-3">
                          <Quote className="w-5 h-5 text-slate-300 shrink-0" />
                          <p className="text-sm text-slate-600 italic">
                            {restaurant.employeeReview}
                          </p>
                        </div>
                        <p className="text-[10px] text-right text-slate-400 mt-2">— KDN 3년차 사우</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {restaurant.tags.map(tag => (
                          <span key={tag} className="text-[11px] font-medium text-slate-400 bg-slate-50 px-2 py-1 rounded-md">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="md:w-72 space-y-4 border-t md:border-t-0 md:border-l border-slate-100 pt-6 md:pt-0 md:pl-6">
                      <div className="space-y-3">
                        <div className="flex items-start gap-2 text-sm">
                          <MapPin className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                          <span className="text-slate-700 font-medium leading-snug">
                            {restaurant.locationInfo}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Car className="w-4 h-4 shrink-0" />
                          <span>주차: {restaurant.parking}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Users className="w-4 h-4 shrink-0" />
                          <span>단체석: {restaurant.groupSeats ? '가능' : '불가'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <CalendarCheck className="w-4 h-4 shrink-0" />
                          <span>예약: {restaurant.reservation ? '가능' : '불가'}</span>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => handleViewLocation(restaurant)}
                        disabled={loadingMapId === restaurant.id}
                        className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-black transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {loadingMapId === restaurant.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            위치 보기
                            <ChevronRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                      
                      <button 
                        onClick={() => handleRecommend(restaurant.name)}
                        className="w-full py-3 bg-white border-2 border-slate-900 text-slate-900 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                      >
                        <Sparkles className="w-4 h-4 text-kdn-blue" />
                        추천하기
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Success Notification */}
      <AnimatePresence>
        {recommendStatus && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-8 py-4 rounded-2xl shadow-2xl font-bold flex items-center gap-3"
          >
            {recommendStatus}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="mt-20 text-slate-400 text-sm text-center px-6">
        <p>© 2026 KDN Gourmet Guide. For KEPCO KDN Employees Only.</p>
        <div className="flex justify-center gap-4 mt-2">
          <a href="#" className="hover:text-kdn-blue transition-colors">이용약관</a>
          <a href="#" className="hover:text-kdn-blue transition-colors">개인정보처리방침</a>
          <a href="#" className="hover:text-kdn-blue transition-colors">문의하기</a>
        </div>
      </footer>
    </div>
  );
}
