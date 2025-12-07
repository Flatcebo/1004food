import {useCallback} from "react";

interface UseDragAndDropProps {
  setDragActive: (active: boolean) => void;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function useDragAndDrop({
  setDragActive,
  handleFileChange,
}: UseDragAndDropProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        if (e.dataTransfer.files.length === 1) {
          handleFileChange({
            target: {files: e.dataTransfer.files},
          } as any);
        } else {
          handleFileChange({
            target: {files: Array.from(e.dataTransfer.files)},
          } as any);
        }
      }
    },
    [setDragActive, handleFileChange]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(true);
    },
    [setDragActive]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      setDragActive(false);
    },
    [setDragActive]
  );

  return {
    handleDrop,
    handleDragOver,
    handleDragLeave,
  };
}

