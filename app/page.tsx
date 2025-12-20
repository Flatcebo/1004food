"use client";

import * as Excel from "exceljs";
import {saveAs} from "file-saver";
import {useRef, useState} from "react";

// 데이터 배열
const list = [
  {
    orderNum: "A309012",
    menu: "햄버거",
    price: 12000,
    date: "2023-05-01",
  },
  {
    orderNum: "B882175",
    menu: "아메리카노(ice)",
    price: 1900,
    date: "2023-05-17",
  },
  {
    orderNum: "B677919",
    menu: "떡볶이",
    price: 6000,
    date: "2023-05-28",
  },
  {
    orderNum: "A001092",
    menu: "마라탕",
    price: 28000,
    date: "2023-06-12",
  },
  {
    orderNum: "A776511",
    menu: "후라이드치킨",
    price: 18000,
    date: "2023-06-12",
  },
  {
    orderNum: "A256512",
    menu: "고급사시미",
    price: 289900,
    date: "2023-06-12",
  },
  {
    orderNum: "C114477",
    menu: "단체도시락",
    price: 1000000,
    date: "2023-06-19",
  },
];

// TH에 들어갈 텍스트 데이터
const headers = ["주문번호", "메뉴", "가격", "주문날짜"];
// TH width, 단위는 cell의 width나 height 단위는 픽셀이 아닌 엑셀의 너비 기준이다.
const headerWidths = [40, 16, 16, 24];

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadStatus, setUploadStatus] = useState<{
    message: string;
    type: "success" | "error" | "";
  }>({message: "", type: ""});
  const [isUploading, setIsUploading] = useState(false);

  const handleExcelUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus({message: "", type: ""});

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/products/seed-excel", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setUploadStatus({
          message: result.message || "업로드 성공!",
          type: "success",
        });
      } else {
        setUploadStatus({
          message: result.error || "업로드 실패",
          type: "error",
        });
      }
    } catch (error: any) {
      setUploadStatus({
        message: error.message || "업로드 중 오류가 발생했습니다.",
        type: "error",
      });
    } finally {
      setIsUploading(false);
      // input 초기화
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const downloadProductTemplate = async () => {
    try {
      const wb = new Excel.Workbook();
      const sheet = wb.addWorksheet("상품 목록");

      // 헤더 정의
      const headers = [
        "상품명",
        "매핑코드",
        "내외주",
        "택배사",
        "포장",
        "가격",
        "판매가",
        "택배비",
        "구매처",
        "계산서",
        "카테고리",
        "상품타입",
        "사방넷명",
        "비고",
      ];

      const headerRow = sheet.addRow(headers);
      headerRow.height = 30;

      // 헤더 스타일
      headerRow.eachCell((cell, colNum) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {argb: "ff4472c4"},
        };
        cell.font = {
          name: "Arial",
          size: 11,
          bold: true,
          color: {argb: "ffffffff"},
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: "center",
          wrapText: true,
        };
        cell.border = {
          top: {style: "thin", color: {argb: "ff000000"}},
          left: {style: "thin", color: {argb: "ff000000"}},
          bottom: {style: "thin", color: {argb: "ff000000"}},
          right: {style: "thin", color: {argb: "ff000000"}},
        };

        // 열 너비 설정
        const widths = [20, 15, 10, 10, 10, 12, 12, 10, 15, 12, 15, 12, 15, 20];
        sheet.getColumn(colNum).width = widths[colNum - 1];
      });

      // 샘플 데이터 추가
      const sampleData = [
        [
          "샘플 상품 1",
          "PROD001",
          "내주",
          "CJ택배",
          "박스",
          10000,
          12000,
          3000,
          "샘플 업체",
          "세금계산서",
          "식품",
          "일반",
          "샘플상품1",
          "샘플 데이터입니다",
        ],
        [
          "샘플 상품 2",
          "PROD002",
          "외주",
          "로젠",
          "비닐",
          5000,
          7000,
          2500,
          "테스트 업체",
          "현금영수증",
          "생활용품",
          "특가",
          "샘플상품2",
          "",
        ],
      ];

      sampleData.forEach((rowData) => {
        const row = sheet.addRow(rowData);
        row.eachCell((cell) => {
          cell.alignment = {
            vertical: "middle",
            horizontal: "center",
          };
          cell.border = {
            top: {style: "thin", color: {argb: "ffd0d0d0"}},
            left: {style: "thin", color: {argb: "ffd0d0d0"}},
            bottom: {style: "thin", color: {argb: "ffd0d0d0"}},
            right: {style: "thin", color: {argb: "ffd0d0d0"}},
          };
        });
      });

      // 파일 다운로드
      const fileData = await wb.xlsx.writeBuffer();
      const blob = new Blob([fileData], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(blob, "상품_업로드_템플릿.xlsx");
    } catch (error) {
      console.error("템플릿 다운로드 실패:", error);
      alert("템플릿 다운로드 중 오류가 발생했습니다.");
    }
  };

  const handleDownload = async (rows: any) => {
    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          templateId: 8,
          rowIds: [],
          filters: {},
          rows: rows,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "다운로드 실패");
      }

      // 파일 다운로드
      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      let fileName = "download.xlsx";

      if (contentDisposition) {
        const filenameStarMatch = contentDisposition.match(
          /filename\*\s*=\s*UTF-8''([^;]+)/i
        );
        if (filenameStarMatch?.[1]) {
          try {
            fileName = decodeURIComponent(filenameStarMatch[1]);
          } catch (_) {
            fileName = filenameStarMatch[1];
          }
        } else {
          const filenameMatch = contentDisposition.match(
            /filename\s*=\s*\"?([^\";]+)\"?/i
          );
          if (filenameMatch?.[1]) {
            fileName = filenameMatch[1];
          }
        }
      }

      // file-saver 사용 (이미 import되어 있다고 가정)
      // saveAs(blob, fileName);

      // 또는 직접 다운로드
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      console.log("다운로드 완료:", fileName);
    } catch (error) {
      console.error("다운로드 실패:", error);
    }
  };

  const downloadList = async (rows: any) => {
    try {
      //console.log(rows);

      // workbook 생성
      const wb = new Excel.Workbook();
      // sheet 생성
      const sheet = wb.addWorksheet("배달 주문 내역");

      // 상단 헤더(TH) 추가
      const headerRow = sheet.addRow(headers);
      // 헤더의 높이값 지정
      headerRow.height = 30.75;
      // 각 헤더 cell에 스타일 지정
      headerRow.eachCell((cell, colNum) => {
        styleHeaderCell(cell);
        sheet.getColumn(colNum).width = headerWidths[colNum - 1];
      });

      // 각 Data cell에 데이터 삽입 및 스타일 지정
      rows.forEach(({orderNum, menu, price, date}: any) => {
        const rowDatas = [orderNum, menu, price, date];
        const appendRow = sheet.addRow(rowDatas);

        appendRow.eachCell((cell: any, colNum: any) => {
          styleDataCell(cell);
          if (colNum === 1) {
            cell.font = {
              color: {argb: "ff1890ff"},
            };
          }
          if (colNum === 3) {
            cell.numFmt = "0,000";
          }
        });
      });

      // 파일 생성
      const fileData = await wb.xlsx.writeBuffer(); //writeBuffer는 프로미스를 반환하므로 async-await을 사용해야 한다.
      const blob = new Blob([fileData], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(blob, `배달 주문 내역`);
    } catch (error) {
      console.log(error);
    }
  };
  return (
    <div className="App" style={{padding: "20px"}}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          maxWidth: "800px",
        }}
      >
        <h1 style={{fontSize: "2em", marginBottom: "10px"}}>
          1004 Food 관리 시스템
        </h1>

        {/* 엑셀 업로드 섹션 */}
        <div
          style={{
            padding: "20px",
            border: "2px dashed #ccc",
            borderRadius: "8px",
            backgroundColor: "#f9f9f9",
          }}
        >
          <h2 style={{fontSize: "1.3em", marginBottom: "10px"}}>
            📤 상품 데이터 업로드 (Products Seeding)
          </h2>
          <p style={{marginBottom: "15px", color: "#666"}}>
            엑셀 파일의 헤더를 자동으로 DB 칼럼과 매칭하여 저장합니다.
            <br />
            <strong>필수 칼럼:</strong> 상품명, 매핑코드
          </p>
          <div style={{display: "flex", gap: "10px", marginBottom: "15px"}}>
            <button
              onClick={downloadProductTemplate}
              style={{
                padding: "8px 16px",
                background: "#52c41a",
                fontSize: "1.1em",
                color: "#fff",
                border: 0,
                cursor: "pointer",
                borderRadius: "4px",
              }}
            >
              📋 템플릿 다운로드
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleExcelUpload}
              style={{display: "none"}}
            />
            <button
              onClick={handleUploadClick}
              disabled={isUploading}
              style={{
                padding: "8px 16px",
                background: isUploading ? "#ccc" : "#1890ff",
                fontSize: "1.1em",
                color: "#fff",
                border: 0,
                cursor: isUploading ? "not-allowed" : "pointer",
                borderRadius: "4px",
              }}
            >
              {isUploading ? "업로드 중..." : "📁 엑셀 파일 선택"}
            </button>
          </div>

          {uploadStatus.message && (
            <div
              style={{
                marginTop: "15px",
                padding: "10px",
                borderRadius: "4px",
                backgroundColor:
                  uploadStatus.type === "success" ? "#d4edda" : "#f8d7da",
                color: uploadStatus.type === "success" ? "#155724" : "#721c24",
                border: `1px solid ${
                  uploadStatus.type === "success" ? "#c3e6cb" : "#f5c6cb"
                }`,
              }}
            >
              {uploadStatus.message}
            </div>
          )}
        </div>

        {/* 기존 엑셀 다운로드 섹션 */}
        <div
          style={{
            padding: "20px",
            border: "2px solid #e8e8e8",
            borderRadius: "8px",
            backgroundColor: "#f9f9f9",
          }}
        >
          <h2 style={{fontSize: "1.3em", marginBottom: "10px"}}>
            📥 샘플 데이터 다운로드
          </h2>
          <button
            onClick={() => handleDownload(list)}
            style={{
              padding: "8px 16px",
              background: "#0f8107",
              fontSize: "1.2em",
              color: "#fff",
              border: 0,
              cursor: "pointer",
              borderRadius: "4px",
            }}
          >
            📑 엑셀 추출
          </button>
        </div>
      </div>
    </div>
  );
}

const styleHeaderCell = (cell: any) => {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {argb: "ffebebeb"},
  };
  cell.border = {
    bottom: {style: "thin", color: {argb: "-100000f"}},
    right: {style: "thin", color: {argb: "-100000f"}},
  };
  cell.font = {
    name: "Arial",
    size: 12,
    bold: true,
    color: {argb: "ff252525"},
  };
  cell.alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };
};

const styleDataCell = (cell: any) => {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {argb: "ffffffff"},
  };
  cell.border = {
    bottom: {style: "thin", color: {argb: "-100000f"}},
    right: {style: "thin", color: {argb: "-100000f"}},
  };
  cell.font = {
    name: "Arial",
    size: 10,
    color: {argb: "ff252525"},
  };
  cell.alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };
};

export default App;
