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
        model.workbook.definedNames = [];
      }
    }

    // 4. Named ranges 제거 (최상위)
    if (model.definedNames) {
      model.definedNames = [];
    }

    // 5. VBA 프로젝트 제거 (있다면)
    if (model.vbaProject) {
      delete model.vbaProject;
    }

    // 6. 외부 링크 제거 (있다면)
    if (model.externalLinks) {
      delete model.externalLinks;
    }

    // 7. 매크로 제거 (있다면)
    if (model.macros) {
      delete model.macros;
    }

    // 8. Custom XML 제거 (호환성 문제 방지)
    if (model.customXml) {
      delete model.customXml;
    }

    // 9. 워크북 뷰의 문제 속성 제거
    if (model.views && Array.isArray(model.views)) {
      model.views.forEach((view: any) => {
        // 활성 탭은 유지하되, 문제가 될 수 있는 속성 제거
        if (view.xWindow && !isFinite(view.xWindow)) {
          delete view.xWindow;
        }
        if (view.yWindow && !isFinite(view.yWindow)) {
          delete view.yWindow;
        }
      });
    }

    // 10. 워크북 보호 제거 (복구 문제의 원인)
    if (model.workbookProtection) {
      delete model.workbookProtection;
    }

    // 11. 공유 문자열 테이블 정리
    if (model.sharedStrings) {
      // 유효하지 않은 문자열 제거
      if (Array.isArray(model.sharedStrings.values)) {
        model.sharedStrings.values = model.sharedStrings.values.filter(
          (str: any) => str !== null && str !== undefined
        );
      }
    }

    // 12. 워크북 계산 속성 정리
    if (model.calcProperties) {
      // 문제가 될 수 있는 속성만 제거
      if (model.calcProperties.calcId) {
        delete model.calcProperties.calcId;
      }
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
  const existingProps = workbook.properties as any;
  
  if (!workbook.properties) {
    workbook.properties = {
      date1904: false,
    };
  } else {
    // 기존 속성이 있으면 안전한 값으로 초기화
    workbook.properties = {
      date1904: false,
      // 기존 속성 중 안전한 것들만 유지 (any로 캐스팅하여 타입 오류 방지)
      ...(existingProps.creator && {creator: existingProps.creator}),
      ...(existingProps.lastModifiedBy && {lastModifiedBy: existingProps.lastModifiedBy}),
      ...(existingProps.created && {created: existingProps.created}),
      ...(existingProps.modified && {modified: existingProps.modified}),
    } as any;
  }

  // calcProperties 초기화 (fullCalcOnLoad false 설정)
  // ExcelJS 내부 모델 구조 확인
  const workbookModel = (workbook as any).model;
  if (workbookModel) {
    if (!workbookModel.calcProperties) {
      workbookModel.calcProperties = {
        fullCalcOnLoad: false,
      };
    } else {
      // 안전한 값으로 초기화
      workbookModel.calcProperties = {
        fullCalcOnLoad: false,
      };
    }

    // workbookPr 초기화 (Excel이 요구하는 기본 속성)
    if (!workbookModel.workbookPr) {
      workbookModel.workbookPr = {
        date1904: false,
        defaultThemeVersion: undefined, // 테마 버전 제거
      };
    } else if (workbookModel.workbookPr.defaultThemeVersion) {
      delete workbookModel.workbookPr.defaultThemeVersion;
    }
  }

  // 최상위 calcProperties도 확인
  if (!(workbook as any).calcProperties) {
    (workbook as any).calcProperties = {
      fullCalcOnLoad: false,
    };
  } else {
    (workbook as any).calcProperties = {
      fullCalcOnLoad: false,
    };
  }

  // 워크북 뷰 초기화 (안전한 기본값)
  const model = (workbook as any).model;
  if (model && !model.views) {
    model.views = [{
      activeTab: 0,
      firstSheet: 0,
      visibility: 'visible',
    }];
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
 * 워크시트의 문제가 될 수 있는 속성 제거
 * @param worksheet ExcelJS 워크시트 객체
 */
export function cleanWorksheetForExcel(worksheet: ExcelJS.Worksheet): void {
  try {
    const model = (worksheet as any).model;
    
    if (!model) {
      return;
    }

    // 1. 시트 보호 제거 (복구 문제의 원인)
    if (model.sheetProtection) {
      delete model.sheetProtection;
    }

    // 2. 조건부 서식 제거 (호환성 문제 가능)
    if (model.conditionalFormattings) {
      model.conditionalFormattings = [];
    }

    // 3. 자동 필터 제거 (문제가 될 수 있음)
    if (model.autoFilter) {
      delete model.autoFilter;
    }

    // 4. 페이지 설정의 문제 속성 제거
    if (model.pageSetup) {
      // 잘못된 페이지 설정 제거
      if (model.pageSetup.errors) {
        delete model.pageSetup.errors;
      }
    }

    // 5. 그림/도형 제거 (복구 문제의 원인)
    if (model.drawings) {
      model.drawings = [];
    }
    if (model.images) {
      model.images = [];
    }

    // 6. 하이퍼링크 정리 (잘못된 링크 제거)
    if (model.hyperlinks) {
      model.hyperlinks = {};
    }

    // 7. 테이블 정리 (문제가 될 수 있음)
    if (model.tables) {
      model.tables = [];
    }

    // 8. 피벗 테이블 제거
    if (model.pivotTables) {
      model.pivotTables = [];
    }

    // 9. 워크시트 뷰의 문제 속성 제거
    if (model.views && Array.isArray(model.views)) {
      model.views.forEach((view: any) => {
        // 창 고정 정보는 유지하되, 문제가 될 수 있는 속성만 제거
        if (view.xSplit && !isFinite(view.xSplit)) {
          delete view.xSplit;
        }
        if (view.ySplit && !isFinite(view.ySplit)) {
          delete view.ySplit;
        }
      });
    }

    // 10. 셀 병합의 잘못된 참조 제거
    if (model.merges && Array.isArray(model.merges)) {
      model.merges = model.merges.filter((merge: any) => {
        // 유효한 병합 범위인지 확인
        if (!merge || typeof merge !== 'string') {
          return false;
        }
        // 기본적인 셀 범위 패턴 확인 (A1:B2 형식)
        return /^[A-Z]+\d+:[A-Z]+\d+$/.test(merge);
      });
    }

  } catch (error) {
    console.warn("워크시트 정리 중 오류 (무시됨):", error);
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
    // 워크시트 정리 (항상 실행)
    cleanWorksheetForExcel(worksheet);

    // 수식 제거 (옵션)
    if (options.removeFormulas) {
      removeFormulasFromWorksheet(worksheet);
    }

    // 데이터 검증 제거 (옵션)
    if (options.removeDataValidations) {
      removeDataValidations(worksheet);
    }
  });

  // 4. 워크북 레벨 최종 정리
  finalCleanupWorkbook(workbook);
}

/**
 * 워크북 최종 정리 (쓰기 직전)
 * @param workbook ExcelJS 워크북 객체
 */
export function finalCleanupWorkbook(workbook: ExcelJS.Workbook): void {
  try {
    const model = (workbook as any).model;
    
    if (!model) {
      return;
    }

    // 1. 스타일 정리 (불필요한 스타일 제거)
    if (model.styles) {
      // 테마 색상 제거
      if (model.styles.themeElements) {
        delete model.styles.themeElements;
      }
      // 색상 스킴 제거
      if (model.styles.colorScheme) {
        delete model.styles.colorScheme;
      }
    }

    // 2. 미디어 파일 정리 (이미지 등)
    if (model.media && Array.isArray(model.media)) {
      model.media = [];
    }

    // 3. 코멘트 정리 (문제가 될 수 있음)
    workbook.worksheets.forEach((worksheet) => {
      const wsModel = (worksheet as any).model;
      if (wsModel && wsModel.comments) {
        wsModel.comments = [];
      }
    });

    // 4. 빈 워크시트 속성 정리
    workbook.worksheets.forEach((worksheet) => {
      const wsModel = (worksheet as any).model;
      if (wsModel) {
        // 빈 행/열 속성 제거
        if (wsModel.rows && Array.isArray(wsModel.rows)) {
          wsModel.rows = wsModel.rows.filter((row: any) => 
            row && (row.cells || row.height || row.style)
          );
        }
      }
    });

    // 5. 명명된 범위 다시 한 번 확인 및 제거
    if (model.workbook && model.workbook.definedNames) {
      model.workbook.definedNames = [];
    }
    if (model.definedNames) {
      model.definedNames = [];
    }

    // 6. 테마 파일 경로 제거 (XML 참조 오류 방지)
    if (model.media) {
      delete model.media;
    }

  } catch (error) {
    console.warn("워크북 최종 정리 중 오류 (무시됨):", error);
  }
}
