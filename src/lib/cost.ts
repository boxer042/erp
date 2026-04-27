// 이동평균 원가 계산
// (기존재고 × 기존avgCost + 신규수량 × 신규원가) / (기존재고 + 신규수량)
export function computeMovingAverage(
  prevQty: number,
  prevAvgCost: number | null,
  addQty: number,
  addUnitCost: number
): number {
  if (prevQty <= 0 || prevAvgCost == null) return addUnitCost;
  if (addQty <= 0) return prevAvgCost;
  const totalValue = prevQty * prevAvgCost + addQty * addUnitCost;
  return totalValue / (prevQty + addQty);
}
