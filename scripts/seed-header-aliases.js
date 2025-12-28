#!/usr/bin/env node

/**
 * 헤더 aliases 시딩 스크립트
 *
 * 사용법:
 * node scripts/seed-header-aliases.js
 *
 * 또는 npm 스크립트로:
 * npm run seed:header-aliases
 */

const http = require("http");

const BASE_URL = "http://localhost:3000";

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const req = http.request(url, options, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          const response = JSON.parse(body);
          resolve(response);
        } catch (e) {
          reject(new Error(`응답 파싱 실패: ${body}`));
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function seedHeaderAliases() {
  try {
    console.log("헤더 aliases 시딩을 시작합니다...");

    // 먼저 기존 데이터가 있는지 확인
    const checkResponse = await makeRequest("GET", "/api/header-aliases");
    if (
      checkResponse.success &&
      checkResponse.data &&
      checkResponse.data.length > 0
    ) {
      console.log(
        `기존 데이터가 ${checkResponse.data.length}개 존재합니다. 삭제 후 재시딩합니다.`
      );

      // 기존 데이터 삭제
      const deleteResponse = await makeRequest(
        "DELETE",
        "/api/header-aliases/seed"
      );
      if (!deleteResponse.success) {
        throw new Error(`데이터 삭제 실패: ${deleteResponse.error}`);
      }
      console.log(deleteResponse.message);
    }

    // 새 데이터 시딩
    const seedResponse = await makeRequest("POST", "/api/header-aliases/seed");
    if (!seedResponse.success) {
      throw new Error(`시딩 실패: ${seedResponse.error}`);
    }

    console.log("✅ 시딩이 완료되었습니다!");
    console.log(
      `총 ${seedResponse.data.length}개의 헤더 alias가 추가되었습니다.`
    );

    // 시딩된 데이터 목록 출력
    console.log("\n📋 시딩된 헤더 aliases:");
    seedResponse.data.forEach((alias) => {
      console.log(
        `- ${alias.column_key}: ${alias.column_label} (${alias.aliases.length}개 alias)`
      );
    });
  } catch (error) {
    console.error("❌ 시딩 실패:", error.message);
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  seedHeaderAliases();
}

module.exports = {seedHeaderAliases};
