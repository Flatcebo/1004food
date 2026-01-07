// API 엔드포인트를 사용하여 관리자 계정 생성
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

async function createAdminUser() {
  try {
    // 0. 마이그레이션 실행 (테이블이 없는 경우)
    console.log("ℹ️  데이터베이스 마이그레이션 확인 중...");
    const migrateResponse = await fetch(`${BASE_URL}/api/db/migrate-multitenant`, {
      method: "POST",
    });
    const migrateResult = await migrateResponse.json();
    if (migrateResult.success) {
      console.log("✅ 마이그레이션 완료");
    } else {
      console.log("ℹ️  마이그레이션:", migrateResult.error || "이미 완료되었거나 오류 발생");
    }

    // 1. 회사 목록 조회
    const companiesResponse = await fetch(`${BASE_URL}/api/companies`);
    const companiesResult = await companiesResponse.json();

    let companyId;
    let companyName;

    if (!companiesResult.success || !companiesResult.data || companiesResult.data.length === 0) {
      console.log("ℹ️  회사가 존재하지 않습니다. 기본 회사를 생성합니다...");
      // 기본 회사 생성
      const createCompanyResponse = await fetch(`${BASE_URL}/api/companies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "기본 회사" }),
      });

      const createCompanyResult = await createCompanyResponse.json();
      if (!createCompanyResult.success) {
        console.error("❌ 회사 생성 실패:", createCompanyResult.error);
        process.exit(1);
      }

      companyId = createCompanyResult.data.id;
      companyName = createCompanyResult.data.name;
      console.log(`✅ 회사 생성 완료: ${companyName} (ID: ${companyId})`);
    } else {
      companyId = companiesResult.data[0].id;
      companyName = companiesResult.data[0].name;
      console.log(`회사 정보: ${companyName} (ID: ${companyId})`);
    }

    // 2. 사용자 생성
    const password = "1004dongseok";
    const userData = {
      companyId: companyId,
      username: "admin",
      password: password,
      name: "관리자",
      grade: "관리자",
      position: "관리자",
      role: "시스템 관리자",
    };

    const createResponse = await fetch(`${BASE_URL}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userData),
    });

    const createResult = await createResponse.json();

    if (!createResult.success) {
      if (createResult.error && createResult.error.includes("이미 존재")) {
        console.log("ℹ️  이미 'admin' 사용자가 존재합니다.");
        // 기존 사용자 정보 조회
        const usersResponse = await fetch(`${BASE_URL}/api/users`);
        const usersResult = await usersResponse.json();
        if (usersResult.success) {
          const adminUser = usersResult.data.find((u) => u.username === "admin");
          if (adminUser) {
            console.log(`사용자 ID: ${adminUser.id}`);
            console.log(`이름: ${adminUser.name}`);
            console.log(`등급: ${adminUser.grade}`);
          }
        }
        process.exit(0);
      } else {
        console.error("❌ 계정 생성 실패:", createResult.error);
        process.exit(1);
      }
    } else {
      const user = createResult.data;
      console.log("\n✅ 관리자 계정이 성공적으로 생성되었습니다!");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`아이디: ${user.username}`);
      console.log(`비밀번호: ${password}`);
      console.log(`이름: ${user.name}`);
      console.log(`등급: ${user.grade}`);
      console.log(`회사: ${companyName}`);
      console.log(`사용자 ID: ${user.id}`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    }
  } catch (error) {
    console.error("❌ 계정 생성 실패:", error.message);
    console.error("\n💡 서버가 실행 중인지 확인해주세요:");
    console.error("   npm run dev");
    process.exit(1);
  }
}

createAdminUser();
