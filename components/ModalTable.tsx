export default function ModalTable({
  open,
  onClose,
  onSubmit,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 backdrop-blur-xs flex justify-center items-center z-50 bg-[#00000053]"
    >
      <div
        className="bg-white p-10 rounded-lg w-[90vw] h-[90vh] overflow-auto relative z-60"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-0 right-4 text-gray-500 hover:text-gray-700 text-[32px]"
          aria-label="Close"
        >
          ×
        </button>
        {children}

        <div className="relative bottom-0 w-full h-[80px] flex flex-col items-end gap-[8px] mt-4">
          <div className="flex flex-row items-center justify-end gap-[16px] text-white font-semibold">
            <button
              onClick={onSubmit}
              className="px-[32px] py-[10px] rounded-md transition-colors bg-[#1ca2fb] hover:bg-[#1ca2fba0]"
            >
              Upload
            </button>
            <button
              onClick={onClose}
              className="bg-[#fc5656] hover:bg-[#fc5656a0] px-[32px] py-[10px] rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
