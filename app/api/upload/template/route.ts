import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import * as XLSX from "xlsx";

// 한국 시간(KST, UTC+9)을 반환하는 함수
function getKoreaTime(): Date {
  const now = new Date();
  // UTC 시간에 9시간을 더해서 한국 시간으로 변환
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const koreaTime = new Date(utcTime + 9 * 3600000);
  return koreaTime;
}

// 양식 템플릿 저장
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const templateName = formData.get("templateName") as string;

    if (!file) {
      return NextResponse.json(
        {success: false, error: "파일이 제공되지 않았습니다."},
        {status: 400}
      );
    }

    // 엑셀 파일 읽기 - XLSX 사용 (헤더 추출용)
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, {type: "array", cellStyles: true});

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return NextResponse.json(
        {success: false, error: "워크시트가 없습니다."},
        {status: 400}
      );
    }

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // 헤더 추출
    const raw = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
    }) as any[][];

    if (!raw.length || raw[0].length === 0) {
      return NextResponse.json(
        {success: false, error: "파일이 비어있거나 헤더가 없습니다."},
        {status: 400}
      );
    }

    const headers = raw[0].filter(
      (h: any) => h !== null && h !== undefined && String(h).trim() !== ""
    ) as string[];

    if (headers.length === 0) {
      return NextResponse.json(
        {success: false, error: "유효한 헤더가 없습니다."},
        {status: 400}
      );
    }

    // 셀 너비 정보 추출
    const columnWidths: {[key: string]: number} = {};
    if (worksheet["!cols"]) {
      worksheet["!cols"].forEach((col: any, idx: number) => {
        if (headers[idx]) {
          columnWidths[headers[idx]] = col.wch || 15;
        }
      });
    } else {
      headers.forEach((header) => {
        columnWidths[header] = 15;
      });
    }

    // 원본 파일을 Base64로 인코딩하여 저장 (모든 스타일 정보 보존)
    const fileBase64 = Buffer.from(arrayBuffer).toString("base64");

    // 템플릿 정보 저장
    const templateData = {
      name: templateName || file.name.replace(/\.(xlsx|xls)$/i, ""),
      headers: headers,
      columnWidths: columnWidths,
      columnOrder: headers,
      originalFile: fileBase64, // 원본 파일 저장 (색상, 폰트, 테두리 등 모든 스타일 포함)
      worksheetName: firstSheetName,
    };

    // 한국 시간 생성
    const koreaTime = getKoreaTime();

    // DB에 템플릿 저장 (템플릿 테이블이 필요함)
    // 임시로 JSON으로 저장
    const result = await sql`
      INSERT INTO upload_templates (name, template_data, created_at)
      VALUES (${templateData.name}, ${JSON.stringify(
      templateData
    )}, ${koreaTime.toISOString()}::timestamp)
      RETURNING id, created_at
    `.catch(async (err) => {
      // 테이블이 없으면 생성
      if (err.message?.includes("does not exist")) {
        await sql`
          CREATE TABLE IF NOT EXISTS upload_templates (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            template_data JSONB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `;
        // 다시 삽입
        return await sql`
          INSERT INTO upload_templates (name, template_data, created_at)
          VALUES (${templateData.name}, ${JSON.stringify(
          templateData
        )}, ${koreaTime.toISOString()}::timestamp)
          RETURNING id, created_at
        `;
      }
      throw err;
    });

    return NextResponse.json({
      success: true,
      templateId: result[0].id,
      templateName: templateData.name,
      createdAt: result[0].created_at,
      message: "양식 템플릿이 성공적으로 저장되었습니다.",
    });
  } catch (error: any) {
    console.error("템플릿 저장 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

// 저장된 템플릿 목록 조회
export async function GET(request: NextRequest) {
  try {
    const templates = await sql`
      SELECT id, name, template_data, created_at
      FROM upload_templates
      ORDER BY created_at DESC
    `.catch(async (err) => {
      // 테이블이 없으면 빈 배열 반환
      if (err.message?.includes("does not exist")) {
        return [];
      }
      throw err;
    });

    return NextResponse.json({
      success: true,
      templates: templates.map((t: any) => ({
        id: t.id,
        name: t.name,
        templateData: t.template_data,
        createdAt: t.created_at,
      })),
    });
  } catch (error: any) {
    console.error("템플릿 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

// 템플릿 삭제
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const templateId = searchParams.get("id");

    if (!templateId) {
      return NextResponse.json(
        {success: false, error: "템플릿 ID가 필요합니다."},
        {status: 400}
      );
    }

    const result = await sql`
      DELETE FROM upload_templates
      WHERE id = ${templateId}
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json(
        {success: false, error: "템플릿을 찾을 수 없습니다."},
        {status: 404}
      );
    }

    return NextResponse.json({
      success: true,
      message: "템플릿이 성공적으로 삭제되었습니다.",
    });
  } catch (error: any) {
    console.error("템플릿 삭제 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
