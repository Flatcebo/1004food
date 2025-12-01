"use client";

export default function SideBar() {
  return (
    <div className="w-64 h-full bg-blue-500 fixed left-0 top-0">
      <div className="w-full h-full flex flex-col">
        <div className="w-full h-20 bg-red-500">
          <div className="w-full h-full flex items-center justify-center">
            <span>1004</span>
          </div>
        </div>

        <div className="w-full h-full flex mx-8 my-6">
          <div className="w-full h-full flex items-start gap-[20px] font-semibold text-[16px]">
            <button
              className=""
              onClick={() => {
                console.log("관리");
              }}
            >
              <a href="/seller">
                <span>발주서 업로드</span>
              </a>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
