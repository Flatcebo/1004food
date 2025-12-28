# 헤더 Aliases 시딩 가이드

헤더 aliases는 발주서 엑셀 파일에서 컬럼을 자동으로 감지하기 위해 사용되는 별칭 데이터입니다.

## API 엔드포인트

### 시딩 (데이터 추가)
```bash
POST /api/header-aliases/seed
```

기본 헤더 aliases 데이터를 데이터베이스에 삽입합니다.

### 데이터 삭제 (초기화)
```bash
DELETE /api/header-aliases/seed
```

모든 헤더 aliases 데이터를 삭제합니다.

## NPM 스크립트 사용

### 자동 시딩
```bash
npm run seed:header-aliases
```

이 명령어는 다음을 수행합니다:
1. 기존 데이터 확인
2. 기존 데이터가 있으면 삭제
3. 기본 데이터를 새로 삽입
4. 결과 출력

### 수동 시딩

#### 1. 서버 실행
```bash
npm run dev
```

#### 2. 데이터 시딩
```bash
curl -X POST http://localhost:3000/api/header-aliases/seed
```

#### 3. 데이터 확인
```bash
curl http://localhost:3000/api/header-aliases
```

#### 4. 데이터 삭제 (필요시)
```bash
curl -X DELETE http://localhost:3000/api/header-aliases/seed
```

## 기본 데이터 목록

시딩 시 다음 13개의 헤더 aliases가 추가됩니다:

| 컬럼 키 | 컬럼 라벨 | Alias 목록 |
|---------|-----------|------------|
| vendor | 업체명 | 업체명, 업체, 거래처명, 고객주문처명, 매입처명 |
| shopName | 쇼핑몰명 | 쇼핑몰명(1), 쇼핑몰명, 쇼핑몰, 몰명 |
| inout | 내외주 | 내외주 |
| carrier | 택배사 | 택배사, 택배사명, 택배, 배송사 |
| receiverName | 수령인명 | 수령인명, 수령인, 받는사람, 받는분, 이름, 성명 |
| receiverPhone | 수령인연락처 | 수령인연락처, 수령인전화, 받는사람전화, 연락처, 전화번호, 휴대폰 |
| receiverAddr | 수령인주소 | 수령인주소, 수령인주소, 받는사람주소, 주소, 배송주소 |
| productName | 상품명 | 상품명, 제품명, 상품, 품명, 상품이름 |
| productOption | 옵션 | 옵션, 옵션명, 상품옵션, 선택사항 |
| quantity | 수량 | 수량, 개수, 갯수, 주문수량 |
| orderNumber | 주문번호 | 주문번호, 주문번호, 주문번호, 오더넘버 |
| box | 박스 | 박스, 박스수량, 박스개수 |
| volume | 부피 | 부피, 부피중량, 무게, 중량 |

## 관리 페이지

헤더 aliases는 `/header-aliases` 페이지에서 관리할 수 있습니다:

- **조회**: 등록된 모든 aliases 확인
- **추가**: 새로운 컬럼과 aliases 추가
- **수정**: 기존 aliases 편집
- **삭제**: 불필요한 aliases 제거

## 주의사항

- 시딩 API는 기존 데이터가 있을 경우 실패합니다
- 초기화를 원할 경우 먼저 DELETE API로 데이터를 삭제한 후 시딩하세요
- `npm run seed:header-aliases` 명령어는 자동으로 이 과정을 수행합니다
