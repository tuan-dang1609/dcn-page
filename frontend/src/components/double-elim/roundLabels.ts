export const getDoubleElimRoundTitle = (
  roundNumber: number,
  totalRounds: number,
  firstRoundMatchCount: number,
  teamCount: number,
) => {
  if (teamCount === 4 || totalRounds === 5) {
    const labels: Record<number, string> = {
      1: "BÁN KẾT NHÁNH TRÊN",
      2: "CHUNG KẾT NHÁNH TRÊN",
      3: "TRANH HẠNG 4",
      4: "TRANH HẠNG 3",
      5: "CHUNG KẾT TỔNG",
    };
    return labels[roundNumber] ?? `VÒNG ${roundNumber}`;
  }

  if (teamCount === 8 || totalRounds >= 8) {
    const labels: Record<number, string> = {
      1: "TỨ KẾT NHÁNH TRÊN",
      2: "BÁN KẾT NHÁNH TRÊN",
      3: "CHUNG KẾT NHÁNH TRÊN",
      4: "VÒNG LOẠI 1",
      5: "VÒNG LOẠI 2",
      6: "TRẬN LOẠI 3",
      7: "CHUNG KẾT NHÁNH THUA",
      8: "CHUNG KẾT TỔNG",
    };
    return labels[roundNumber] ?? `VÒNG ${roundNumber}`;
  }

  if (teamCount === 6) {
    if (totalRounds === 7) {
      const labels: Record<number, string> = {
        1: "PLAY-IN NHÁNH TRÊN",
        2: "BÁN KẾT NHÁNH TRÊN",
        3: "CHUNG KẾT NHÁNH TRÊN",
        4: "LOẠI 1",
        5: "LOẠI 2",
        6: "CHUNG KẾT NHÁNH THUA",
        7: "CHUNG KẾT TỔNG",
      };
      return labels[roundNumber] ?? `VÒNG ${roundNumber}`;
    }

    const labels: Record<number, string> = {
      1: "PLAY-IN NHÁNH TRÊN",
      2: "BÁN KẾT NHÁNH TRÊN",
      3: "CHUNG KẾT NHÁNH TRÊN",
      4: "LOẠI 1",
      5: "LOẠI 2",
      6: "LOẠI 3",
      7: "CHUNG KẾT NHÁNH THUA",
      8: "CHUNG KẾT TỔNG",
    };
    return labels[roundNumber] ?? `VÒNG ${roundNumber}`;
  }

  if (totalRounds === 2) {
    return roundNumber === 1 ? "BÁN KẾT" : "CHUNG KẾT";
  }

  if (totalRounds === 3 && firstRoundMatchCount >= 4) {
    if (roundNumber === 1) return "TỨ KẾT";
    if (roundNumber === 2) return "BÁN KẾT";
    return "CHUNG KẾT";
  }

  return `VÒNG ${roundNumber}`;
};
