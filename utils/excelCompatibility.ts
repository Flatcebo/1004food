// Excel 호환성 개선을 위한 유틸리티 함수
import ExcelJS from "exceljs";

/**
 * Microsoft Excel과의 호환성을 위해 워크북을 정리
 * - 테마 제거
 * - Named Ranges 제거
 * - 지원되지 않는 기능 제거
 * @param workbook ExcelJS 워크북 객체
 */
export function cleanWorkbookForExcel(workbook: ExcelJS.Workbook): void {
  try {
    const model = (workbook as any).model;

    if (!model) {
      return;
    }

    // 1. 테마 관련 속성 제거 (Excel 복구 알림 방지)
    if (model.theme) {
      delete model.theme;
    }
    if (model.themeManager) {
      delete model.themeManager;
    }

    // 2. 스타일 테마 제거
    if (model.styles && model.styles.themes) {
      delete model.styles.themes;
    }

    // 3. 워크북 레벨 테마 제거
    if (model.workbook) {
      if (model.workbook.theme) {
        delete model.workbook.theme;
      }

      // Named ranges 제거 (XML 오류 방지)
      if (model.workbook.definedNames) {
        delete model.workbook.definedNames;
      }
    }

    // 4. Named ranges 제거 (최상위)
    if (model.definedNames) {
      delete model.definedNames;
    }

    // 5. 최상위 definedNames 제거 (getter 전용 프로퍼티이므로 내부 모델만 처리)
    // workbook.definedNames는 getter만 있으므로 직접 할당 불가

    // 6. VBA 프로젝트 제거 (있다면)
    if (model.vbaProject) {
      delete model.vbaProject;
    }

    // 7. 외부 링크 제거 (있다면)
    if (model.externalLinks) {
      delete model.externalLinks;
    }

    // 8. 매크로 제거 (있다면)
    if (model.macros) {
      delete model.macros;
    }

    // 9. Custom XML 제거 (호환성 문제 방지)
    if (model.customXml) {
      delete model.customXml;
    }
  } catch (error) {
    // 정리 실패는 무시 (필수 작업이 아님)
    console.warn("워크북 정리 중 오류 (무시됨):", error);
  }
}

/**
 * 워크북 속성 초기화 (Excel 호환성)
 * @param workbook ExcelJS 워크북 객체
 */
export function initializeWorkbookProperties(workbook: ExcelJS.Workbook): void {
  // properties 초기화 (date1904 false 설정)
  if (!workbook.properties) {
    workbook.properties = {
      date1904: false,
    };
  } else if (workbook.properties.date1904 === undefined) {
    workbook.properties.date1904 = false;
  }

  // calcProperties 초기화 (fullCalcOnLoad false 설정)
  // ExcelJS 내부 모델 구조 확인
  const workbookModel = (workbook as any).model;
  if (workbookModel) {
    if (!workbookModel.calcProperties) {
      workbookModel.calcProperties = {
        fullCalcOnLoad: false,
      };
    } else if (workbookModel.calcProperties.fullCalcOnLoad === undefined) {
      workbookModel.calcProperties.fullCalcOnLoad = false;
    }
  }

  // 최상위 calcProperties도 확인
  if (!(workbook as any).calcProperties) {
    (workbook as any).calcProperties = {
      fullCalcOnLoad: false,
    };
  } else if ((workbook as any).calcProperties.fullCalcOnLoad === undefined) {
    (workbook as any).calcProperties.fullCalcOnLoad = false;
  }
}

/**
 * 워크시트의 수식 제거 (값만 유지)
 * Microsoft Excel에서 지원하지 않는 수식이 있을 경우 문제가 될 수 있음
 * @param worksheet ExcelJS 워크시트 객체
 */
export function removeFormulasFromWorksheet(
  worksheet: ExcelJS.Worksheet
): void {
  try {
    worksheet.eachRow({includeEmpty: false}, (row) => {
      row.eachCell({includeEmpty: false}, (cell) => {
        // 수식이 있는 경우 값만 유지
        if (cell.formula) {
          const value = cell.value;
          // 수식 결과 값만 유지
          if (
            typeof value === "object" &&
            (value as any).result !== undefined
          ) {
            cell.value = (value as any).result;
          }
        }
      });
    });
  } catch (error) {
    console.warn("수식 제거 중 오류 (무시됨):", error);
  }
}

/**
 * 워크시트의 데이터 검증 제거
 * 일부 복잡한 데이터 검증은 Excel에서 문제를 일으킬 수 있음
 * @param worksheet ExcelJS 워크시트 객체
 */
export function removeDataValidations(worksheet: ExcelJS.Worksheet): void {
  try {
    // ExcelJS 내부 모델을 통해 데이터 검증 제거
    const model = (worksheet as any).model;
    if (model && model.dataValidations) {
      model.dataValidations = {};
    }
  } catch (error) {
    console.warn("데이터 검증 제거 중 오류 (무시됨):", error);
  }
}

/**
 * 워크북을 Excel 호환 모드로 완전히 정리
 * @param workbook ExcelJS 워크북 객체
 * @param options 옵션
 */
export function prepareWorkbookForExcel(
  workbook: ExcelJS.Workbook,
  options: {
    removeFormulas?: boolean;
    removeDataValidations?: boolean;
  } = {}
): void {
  // 1. 속성 초기화
  initializeWorkbookProperties(workbook);

  // 2. 워크북 정리
  cleanWorkbookForExcel(workbook);

  // 3. 각 워크시트 처리
  workbook.worksheets.forEach((worksheet) => {
    // 수식 제거 (옵션)
    if (options.removeFormulas) {
      removeFormulasFromWorksheet(worksheet);
    }

    // 데이터 검증 제거 (옵션)
    if (options.removeDataValidations) {
      removeDataValidations(worksheet);
    }
  });
}
