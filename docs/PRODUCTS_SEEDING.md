# Products 테이블 Seeding 가이드

## 개요
엑셀 파일을 업로드하여 products 테이블에 데이터를 자동으로 저장하는 기능입니다.
엑셀 파일의 헤더를 자동으로 DB 칼럼명과 매칭하여 처리합니다.

## 구현된 파일들

### 1. Constants
- `/constants/productColumnMappings.ts`
  - 엑셀 헤더와 DB 칼럼명 매칭 규칙 정의
  - 다양한 헤더명을 자동으로 인식 (예: "상품명", "이름", "제품명" 등)

### 2. API
- `/app/api/products/seed-excel/route.ts`
  - 엑셀 파일을 읽고 헤더 자동 매칭
  - 매핑된 데이터를 products 테이블에 저장
  - 중복 데이터는 자동 업데이트 (UPSERT)

### 3. UI
- `/app/page.tsx`
  - 엑셀 업로드 UI
  - 템플릿 다운로드 기능
  - 업로드 상태 표시

## 사용 방법

### 1단계: 템플릿 다운로드
메인 페이지(`http://localhost:3000`)에서 "📋 템플릿 다운로드" 버튼을 클릭하여 양식을 다운로드합니다.

### 2단계: 데이터 입력
다운로드한 템플릿에 상품 데이터를 입력합니다.

**필수 칼럼:**
- 상품명 (name)
- 매핑코드 (code)

**선택 칼럼:**
- 내외주 (type)
- 택배사 (postType)
- 포장 (pkg)
- 가격 (price)
- 판매가 (salePrice)
- 택배비 (postFee)
- 구매처 (purchase)
- 계산서 (billType)
- 카테고리 (category)
- 상품타입 (productType)
- 사방넷명 (sabangName)
- 비고 (etc)

### 3단계: 엑셀 업로드
"📁 엑셀 파일 선택" 버튼을 클릭하여 작성한 엑셀 파일을 업로드합니다.

### 4단계: 결과 확인
업로드가 완료되면 성공/실패 메시지가 표시됩니다.

## 헤더 매칭 규칙

시스템은 다음과 같은 헤더명을 자동으로 인식합니다:

| DB 칼럼 | 인식되는 헤더명 |
|---------|----------------|
| name | 상품명, 이름, 제품명, name |
| code | 매핑코드, 코드, 상품코드, code |
| type | 내외주, 타입, type |
| postType | 택배사, 배송사, post_type, postType |
| pkg | 포장, 패키지, pkg, package |
| price | 가격, 단가, price |
| salePrice | 판매가, 판매가격, sale_price, salePrice |
| postFee | 택배비, 배송비, post_fee, postFee |
| purchase | 구매처, 업체, 거래처, purchase |
| billType | 계산서, 세금계산서, bill_type, billType |
| category | 카테고리, 분류, category |
| productType | 상품타입, 제품타입, product_type, productType |
| sabangName | 사방넷명, 사방넷, sabang_name, sabangName |
| etc | 비고, 기타, 메모, etc, note |

**참고:** 헤더명은 대소문자와 공백을 무시하고 매칭됩니다.

## 중복 처리

동일한 상품명(name)과 매핑코드(code) 조합이 이미 존재하는 경우:
- 기존 데이터를 새로운 데이터로 자동 업데이트
- created_at은 유지되고 updated_at만 업데이트

## API 직접 호출 (선택)

프로그래밍 방식으로 API를 직접 호출할 수도 있습니다:

```javascript
const formData = new FormData();
formData.append('file', excelFile);

const response = await fetch('/api/products/seed-excel', {
  method: 'POST',
  body: formData,
});

const result = await response.json();
console.log(result);
```

**응답 예시:**
```json
{
  "success": true,
  "message": "50개의 상품이 성공적으로 저장되었습니다.",
  "count": 50,
  "foundColumns": ["name", "code", "type", "price", "salePrice"]
}
```

## 오류 처리

### 일반적인 오류와 해결 방법

1. **"파일이 비어있거나 헤더가 없습니다"**
   - 엑셀 파일의 첫 번째 행에 헤더가 있는지 확인하세요.

2. **"필수 칼럼이 없습니다"**
   - '상품명'과 '매핑코드' 칼럼이 반드시 포함되어야 합니다.
   - 헤더명이 위의 매칭 규칙과 일치하는지 확인하세요.

3. **"저장할 유효한 데이터가 없습니다"**
   - 상품명과 매핑코드가 비어있지 않은 행이 최소 1개 이상 있어야 합니다.

4. **"워크시트가 없습니다"**
   - 유효한 엑셀 파일(.xlsx, .xls)인지 확인하세요.

## 데이터베이스 스키마

products 테이블 구조:

```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50),
  post_type VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,
  pkg VARCHAR(50),
  price INTEGER,
  sale_price INTEGER,
  post_fee INTEGER,
  purchase VARCHAR(255),
  bill_type VARCHAR(50),
  category VARCHAR(255),
  product_type VARCHAR(50),
  sabang_name VARCHAR(255),
  etc TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name, code)
);
```

## 추가 정보

- 지원 파일 형식: `.xlsx`, `.xls`
- 최대 파일 크기: 제한 없음 (서버 설정에 따름)
- 한 번에 처리 가능한 행 수: 제한 없음
- 타임존: 한국 시간(KST, UTC+9) 자동 적용

## 문의

기능 개선 사항이나 버그 발견 시 개발팀에 문의해주세요.

