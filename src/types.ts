export type Purpose = '혼밥' | '팀 점심' | '저녁 회식' | '외빈 접대';
export type Category = '한식' | '중식' | '일식' | '양식' | '고기/구이' | '카페/디저트' | '기타';
export type Budget = '1만원 이하' | '1~2만원' | '2~5만원' | '5만원 이상';

export interface Restaurant {
  id: string;
  name: string;
  category: Category;
  signatureMenu: string;
  description: string;
  locationInfo: string; // KDN 본사 기준 설명
  parking: string;
  groupSeats: boolean;
  reservation: boolean;
  employeeReview: string; // KDN 사우 가상 한줄평
  tags: string[];
  priceRange: Budget;
  naverMapUrl: string;
}
