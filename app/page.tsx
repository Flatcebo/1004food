"use client";

import {useState, useEffect} from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";
import {Bar, Line, Chart} from "react-chartjs-2";

// Chart.js 등록 - 혼합 차트를 위해 모든 필요한 요소 등록
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

interface DashboardChartData {
  dailyOrders: {date: string; orderCount: number}[];
  dailySalesProfit: {date: string; sales: number; profit: number}[];
  topVendorsByOrders: {vendorName: string; orderCount: number}[];
  topVendorsBySales: {vendorName: string; sales: number}[];
  topProductsByOrders: {
    productCode: string;
    sabangName: string;
    orderCount: number;
  }[];
}

export default function App() {
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalOrders: 0,
    todayOrders: 0,
    pendingOrders: 0,
  });

  const [chartData, setChartData] = useState<DashboardChartData>({
    dailyOrders: [],
    dailySalesProfit: [],
    topVendorsByOrders: [],
    topVendorsBySales: [],
    topProductsByOrders: [],
  });

  const [loading, setLoading] = useState(true);
  
  // Line 컨트롤러 등록을 위해 Line 컴포넌트를 한 번 렌더링 (숨김)
  useEffect(() => {
    // Line 컴포넌트가 import되면 자동으로 Line 컨트롤러가 등록됨
    // 이는 혼합 차트에서 Line 타입을 사용하기 위해 필요
  }, []);

  useEffect(() => {
    // 대시보드 통계 데이터 로드
    loadDashboardStats();
    loadChartData();
  }, []);

  const loadDashboardStats = async () => {
    try {
      // company-id 헤더 포함
      const headers: HeadersInit = {};

      if (typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem("auth-storage");
          if (stored) {
            const parsed = JSON.parse(stored);
            const user = parsed.state?.user;
            if (user?.companyId) {
              headers["company-id"] = user.companyId.toString();
            }
          }
        } catch (e) {
          console.error("인증 정보 로드 실패:", e);
        }
      }

      // 상품 수 조회 (count 모드로 효율적 조회)
      const productsResponse = await fetch("/api/products/list?count=true", {
        headers,
      });
      const productsData = await productsResponse.json();

      // 주문 통계 조회
      const ordersResponse = await fetch("/api/upload/list?stats=true", {
        headers,
      });
      const ordersData = await ordersResponse.json();

      setStats({
        totalProducts: productsData.success ? productsData.total : 0,
        totalOrders: ordersData.success ? ordersData.stats.totalOrders : 0,
        todayOrders: ordersData.success ? ordersData.stats.todayOrders : 0,
        pendingOrders: ordersData.success ? ordersData.stats.pendingOrders : 0,
      });
    } catch (error) {
      console.error("대시보드 통계 로드 실패:", error);
      // 에러 발생 시 기본값 설정
      setStats({
        totalProducts: 0,
        totalOrders: 0,
        todayOrders: 0,
        pendingOrders: 0,
      });
    }
  };

  const loadChartData = async () => {
    try {
      setLoading(true);
      const headers: HeadersInit = {};

      if (typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem("auth-storage");
          if (stored) {
            const parsed = JSON.parse(stored);
            const user = parsed.state?.user;
            if (user?.companyId) {
              headers["company-id"] = user.companyId.toString();
            }
          }
        } catch (e) {
          console.error("인증 정보 로드 실패:", e);
        }
      }

      const response = await fetch("/api/dashboard/stats?days=30&topLimit=10", {
        headers,
      });
      const result = await response.json();

      if (result.success) {
        setChartData(result.data);
      }
    } catch (error) {
      console.error("차트 데이터 로드 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  // 날짜 포맷팅 (MM/DD)
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${(date.getMonth() + 1).toString().padStart(2, "0")}/${date
      .getDate()
      .toString()
      .padStart(2, "0")}`;
  };

  // 금액 포맷팅
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          📊 1004 Food 대시보드
        </h1>
        <p className="text-gray-600">
          주문 관리 시스템 현황을 한눈에 확인하세요
        </p>
      </div> */}

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">총 상품 수</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.totalProducts.toLocaleString()}
              </p>
            </div>
            <div className="text-blue-500">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">총 주문 수</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.totalOrders.toLocaleString()}
              </p>
            </div>
            <div className="text-green-500">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">오늘 주문</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.todayOrders.toLocaleString()}
              </p>
            </div>
            <div className="text-yellow-500">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">대기 주문</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.pendingOrders.toLocaleString()}
              </p>
            </div>
            <div className="text-red-500">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* 빠른 액션 */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          ⚡ 빠른 액션
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/order"
            className="flex items-center p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <div className="text-blue-600 mr-3">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">주문 관리</h3>
              <p className="text-sm text-gray-600">주문 리스트 확인 및 처리</p>
            </div>
          </a>

          <a
            href="/products"
            className="flex items-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
          >
            <div className="text-green-600 mr-3">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">상품 관리</h3>
              <p className="text-sm text-gray-600">상품 목록 및 데이터 관리</p>
            </div>
          </a>

          <a
            href="/upload/templates"
            className="flex items-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
          >
            <div className="text-purple-600 mr-3">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">템플릿 관리</h3>
              <p className="text-sm text-gray-600">발주서 템플릿 설정</p>
            </div>
          </a>
        </div>
      </div>

      {/* 차트 섹션 */}
      {!loading && (
        <div className="space-y-6 mb-8">
          {/* 1. 일일 주문 수량 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              📈 일일 주문 수량
            </h2>
            {chartData.dailyOrders.length > 0 ? (
              <div className="h-[300px]">
                <Bar
                  data={{
                    labels: chartData.dailyOrders.map((item) =>
                      formatDate(item.date)
                    ),
                    datasets: [
                      {
                        label: "주문 수량",
                        data: chartData.dailyOrders.map(
                          (item) => item.orderCount
                        ),
                        backgroundColor: "#3b82f6",
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        display: true,
                      },
                      tooltip: {
                        callbacks: {
                          label: function (context) {
                            return `${context.parsed.y}건`;
                          },
                        },
                      },
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        ticks: {
                          callback: function (value) {
                            return `${value}건`;
                          },
                        },
                      },
                    },
                  }}
                />
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                데이터가 없습니다.
              </div>
            )}
          </div>

          {/* 2. 일일 매출과 이익액 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              💰 일일 매출과 이익액
            </h2>
            {chartData.dailySalesProfit.length > 0 ? (
              <div className="h-[300px] relative">
                {/* Line 컨트롤러 등록을 위한 숨김 Line 차트 */}
                <div style={{position: "absolute", visibility: "hidden", height: 0}}>
                  <Line
                    data={{
                      labels: [],
                      datasets: [],
                    }}
                    options={{responsive: false}}
                  />
                </div>
                <Chart
                  type="bar"
                  data={{
                    labels: chartData.dailySalesProfit.map((item) =>
                      formatDate(item.date)
                    ),
                    datasets: [
                      {
                        type: "bar" as const,
                        label: "매출",
                        data: chartData.dailySalesProfit.map(
                          (item) => item.sales
                        ),
                        backgroundColor: "#10b981",
                        yAxisID: "y",
                      },
                      {
                        type: "line" as const,
                        label: "이익",
                        data: chartData.dailySalesProfit.map(
                          (item) => item.profit
                        ),
                        borderColor: "#f59e0b",
                        backgroundColor: "#f59e0b",
                        borderWidth: 2,
                        fill: false,
                        tension: 0.1,
                        yAxisID: "y1",
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        display: true,
                      },
                      tooltip: {
                        callbacks: {
                          label: function (context) {
                            const value = context.parsed.y ?? 0;
                            if (context.dataset.label === "매출") {
                              return `매출: ${formatCurrency(value)}`;
                            } else if (context.dataset.label === "이익") {
                              return `이익: ${formatCurrency(value)}`;
                            }
                            return `${context.dataset.label}: ${formatCurrency(
                              value
                            )}`;
                          },
                        },
                      },
                    },
                    scales: {
                      y: {
                        type: "linear" as const,
                        display: true,
                        position: "left" as const,
                        beginAtZero: true,
                        ticks: {
                          callback: function (value) {
                            return `${(Number(value) / 10000).toFixed(0)}만원`;
                          },
                        },
                      },
                      y1: {
                        type: "linear" as const,
                        display: true,
                        position: "right" as const,
                        beginAtZero: true,
                        grid: {
                          drawOnChartArea: false,
                        },
                        ticks: {
                          callback: function (value) {
                            return `${(Number(value) / 10000).toFixed(0)}만원`;
                          },
                        },
                      },
                    },
                  }}
                />
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                데이터가 없습니다.
              </div>
            )}
          </div>

          {/* 3. 주문수 많은 업체 Top 10 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              🏢 주문수 많은 업체 Top 10
            </h2>
            {chartData.topVendorsByOrders.length > 0 ? (
              <div className="h-[400px]">
                <Bar
                  data={{
                    labels: chartData.topVendorsByOrders.map(
                      (item) => item.vendorName
                    ),
                    datasets: [
                      {
                        label: "주문 수량",
                        data: chartData.topVendorsByOrders.map(
                          (item) => item.orderCount
                        ),
                        backgroundColor: chartData.topVendorsByOrders.map(
                          (_, index) => {
                            const colors = [
                              "#8b5cf6",
                              "#7c3aed",
                              "#6d28d9",
                              "#5b21b6",
                              "#4c1d95",
                            ];
                            return colors[index % 5];
                          }
                        ),
                      },
                    ],
                  }}
                  options={{
                    indexAxis: "y" as const,
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        display: true,
                      },
                      tooltip: {
                        callbacks: {
                          label: function (context) {
                            return `${context.parsed.x}건`;
                          },
                        },
                      },
                    },
                    scales: {
                      x: {
                        beginAtZero: true,
                        ticks: {
                          callback: function (value) {
                            return `${value}건`;
                          },
                        },
                      },
                    },
                  }}
                />
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                데이터가 없습니다.
              </div>
            )}
          </div>

          {/* 4. 매출 높은 업체 Top 10 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              💵 매출 높은 업체 Top 10
            </h2>
            {chartData.topVendorsBySales.length > 0 ? (
              <div className="h-[400px]">
                <Bar
                  data={{
                    labels: chartData.topVendorsBySales.map(
                      (item) => item.vendorName
                    ),
                    datasets: [
                      {
                        label: "매출",
                        data: chartData.topVendorsBySales.map(
                          (item) => item.sales
                        ),
                        backgroundColor: chartData.topVendorsBySales.map(
                          (_, index) => {
                            const colors = [
                              "#10b981",
                              "#059669",
                              "#047857",
                              "#065f46",
                              "#064e3b",
                            ];
                            return colors[index % 5];
                          }
                        ),
                      },
                    ],
                  }}
                  options={{
                    indexAxis: "y" as const,
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        display: true,
                      },
                      tooltip: {
                        callbacks: {
                          label: function (context) {
                            const value = context.parsed.x ?? 0;
                            return `매출: ${formatCurrency(value)}`;
                          },
                        },
                      },
                    },
                    scales: {
                      x: {
                        beginAtZero: true,
                        ticks: {
                          callback: function (value) {
                            return `${(Number(value) / 10000).toFixed(0)}만원`;
                          },
                        },
                      },
                    },
                  }}
                />
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                데이터가 없습니다.
              </div>
            )}
          </div>

          {/* 5. 주문수 많은 상품 Top 10 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              📦 주문수 많은 상품 Top 10
            </h2>
            {chartData.topProductsByOrders.length > 0 ? (
              <div className="h-[400px]">
                <Bar
                  data={{
                    labels: chartData.topProductsByOrders.map(
                      (item) => item.sabangName
                    ),
                    datasets: [
                      {
                        label: "주문 수량",
                        data: chartData.topProductsByOrders.map(
                          (item) => item.orderCount
                        ),
                        backgroundColor: chartData.topProductsByOrders.map(
                          (_, index) => {
                            const colors = [
                              "#ec4899",
                              "#db2777",
                              "#be185d",
                              "#9f1239",
                              "#831843",
                            ];
                            return colors[index % 5];
                          }
                        ),
                      },
                    ],
                  }}
                  options={{
                    indexAxis: "y" as const,
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        display: true,
                      },
                      tooltip: {
                        callbacks: {
                          label: function (context) {
                            const dataIndex = context.dataIndex;
                            const item =
                              chartData.topProductsByOrders[dataIndex];
                            return [
                              `상품코드: ${item.productCode}`,
                              `사방넷명: ${item.sabangName}`,
                              `주문 수량: ${context.parsed.x}건`,
                            ];
                          },
                        },
                      },
                    },
                    scales: {
                      x: {
                        beginAtZero: true,
                        ticks: {
                          callback: function (value) {
                            return `${value}건`;
                          },
                        },
                      },
                    },
                  }}
                />
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                데이터가 없습니다.
              </div>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="text-center py-8 text-gray-500">
            차트 데이터를 불러오는 중...
          </div>
        </div>
      )}

      {/* 최근 활동 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          📋 최근 활동
        </h2>
        <div className="space-y-3">
          <div className="flex items-center p-3 bg-gray-50 rounded-lg">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                시스템 초기화 완료
              </p>
              <p className="text-xs text-gray-600">2024년 12월 22일</p>
            </div>
          </div>
          <div className="text-center py-4 text-gray-500">
            <p>더 많은 활동 내역이 여기에 표시됩니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
