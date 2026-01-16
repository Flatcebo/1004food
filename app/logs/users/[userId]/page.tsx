"use client";

import {useState, useEffect} from "react";
import {useParams} from "next/navigation";
import {getAuthHeaders} from "@/utils/api";
import UploadComparisonModal from "@/components/UploadComparisonModal";

interface User {
  id: number;
  name: string;
  username: string;
  lastLoginAt: string | null;
  companyName: string;
}

interface UploadFile {
  id: string;
  fileName: string;
  vendorName: string | null;
  rowCount: number;
  uploadTime: string;
  source: "temp_files" | "uploads";
}

export default function UserLogPage() {
  const params = useParams();
  const userId = params?.userId as string;
  const [user, setUser] = useState<User | null>(null);
  const [uploads, setUploads] = useState<UploadFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [selectedUpload, setSelectedUpload] = useState<UploadFile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchUserUploads();
    }
  }, [userId]);

  const fetchUserUploads = async () => {
    try {
      setIsLoading(true);
      const headers = getAuthHeaders();
      const response = await fetch(`/api/logs/users/${userId}/uploads`, {
        headers,
      });
      const result = await response.json();

      if (!result.success) {
        setError(result.error || "데이터를 불러오는데 실패했습니다.");
        return;
      }

      setUser(result.data.user);
      // temp_files와 uploads를 합쳐서 정렬
      const allUploads = [
        ...result.data.uploads,
        ...result.data.uploadsFromDb.map((u: any) => ({
          ...u,
          id: u.id.toString(),
        })),
      ].sort((a, b) => {
        return (
          new Date(b.uploadTime).getTime() - new Date(a.uploadTime).getTime()
        );
      });
      setUploads(allUploads);
    } catch (err: any) {
      console.error("데이터 조회 오류:", err);
      setError("데이터를 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadClick = (upload: UploadFile) => {
    setSelectedUpload(upload);
    setIsModalOpen(true);
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "로그인 이력 없음";
    return new Date(dateString).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col p-6 bg-gray-50 overflow-auto">
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {user && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            {user.name}님의 업로드 이력
          </h1>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm text-gray-500">아이디:</span>
              <span className="ml-2 text-gray-900">{user.username}</span>
            </div>
            <div>
              <span className="text-sm text-gray-500">회사:</span>
              <span className="ml-2 text-gray-900">{user.companyName}</span>
            </div>
            <div className="col-span-2">
              <span className="text-sm text-gray-500">최근 로그인 시간:</span>
              <span className="ml-2 text-gray-900 font-medium">
                {formatDateTime(user.lastLoginAt)}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 bg-white rounded-lg shadow overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">
            업로드한 파일 리스트
          </h2>
        </div>
        {uploads.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            업로드한 파일이 없습니다.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    파일명
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    업체명
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    행 수
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    업로드 시간
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {uploads.map((upload) => (
                  <tr
                    key={`${upload.source}-${upload.id}`}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {upload.fileName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {upload.vendorName || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {upload.rowCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDateTime(upload.uploadTime)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleUploadClick(upload)}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        상세보기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && selectedUpload && (
        <UploadComparisonModal
          uploadId={selectedUpload.id}
          source={selectedUpload.source}
          fileName={selectedUpload.fileName}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedUpload(null);
          }}
        />
      )}
    </div>
  );
}
