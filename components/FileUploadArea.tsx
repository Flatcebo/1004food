"use client";

import {RefObject} from "react";

interface FileUploadAreaProps {
  dragActive: boolean;
  fileInputRef: RefObject<HTMLInputElement>;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function FileUploadArea({
  dragActive,
  fileInputRef,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileChange,
}: FileUploadAreaProps) {
  return (
    <div
      className={`w-full border-2 border-dashed rounded-lg px-8 py-16 flex flex-col items-center justify-center transition-colors hover:bg-[#9a9a9a51] ${
        dragActive
          ? "border-blue-500 bg-blue-50"
          : "border-gray-300 bg-gray-100"
      }`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => fileInputRef?.current?.click()}
      style={{cursor: "pointer"}}
    >
      <input
        type="file"
        accept=".xlsx, .xls"
        ref={fileInputRef}
        onChange={onFileChange}
        className="hidden"
        multiple
      />
      <div className="text-lg mb-2 text-gray-600">
        파일을 드래그하거나 클릭하여 선택
      </div>
      <div className="text-sm text-gray-400">
        엑셀(.xlsx, .xls) 파일만 가능합니다 (여러 파일 선택 가능)
      </div>
    </div>
  );
}
