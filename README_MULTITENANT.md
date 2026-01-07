# 멀티테넌트 시스템 설정 가이드

## 개요

이 프로젝트는 여러 회사가 사용할 수 있는 멀티테넌트 시스템입니다. 각 회사는 완전히 독립된 데이터를 가지며, 회사 간 데이터 접근이 차단됩니다.

## 설치 및 설정

### 1. 필수 패키지 설치

```bash
npm install bcryptjs
npm install --save-dev @types/bcryptjs
```

### 2. 데이터베이스 마이그레이션 실행

멀티테넌트 구조를 적용하기 위해 마이그레이션을 실행합니다:

```bash
# 브라우저에서 또는 curl로 실행
POST /api/db/migrate-multitenant
```

또는 curl 사용:
```bash
curl -X POST http://localhost:3000/api/db/migrate-multitenant
```

이 마이그레이션은:
- `companies` 테이블 생성
- `users` 테이블 생성
- 모든 기존 테이블에 `company_id` FK 추가
- 기존 데이터를 "기본 회사"에 할당

### 3. 기본 사용자 생성

개발/테스트를 위한 기본 사용자를 생성합니다:

```bash
POST /api/users/seed
```

생성되는 사용자:
- **관리자**: username: `admin`, password: `password123`
- **직원**: username: `employee`, password: `password123`
- **납품업체**: username: `vendor`, password: `password123`

## 사용자 등급 (Grade)

- **납품업체**: 납품 관련 기능 접근
- **관리자**: 모든 기능 접근 및 사용자 관리
- **직원**: 일반 업무 기능 접근

## API 사용법

### 인증

모든 API 호출 시 `company-id` 헤더를 포함해야 합니다:

```javascript
fetch('/api/products/list', {
  headers: {
    'company-id': '1'
  }
})
```

또는 쿼리 파라미터로:
```javascript
fetch('/api/products/list?company_id=1')
```

### 로그인

```javascript
POST /api/auth/login
Body: {
  "username": "admin",
  "password": "password123"
}

Response: {
  "success": true,
  "data": {
    "id": "1",
    "companyId": 1,
    "companyName": "기본 회사",
    "name": "관리자",
    "grade": "관리자",
    "position": "관리자",
    "role": "시스템 관리자"
  }
}
```

### 회사 관리

#### 회사 목록 조회
```javascript
GET /api/companies
```

#### 회사 생성
```javascript
POST /api/companies
Body: {
  "name": "새로운 회사"
}
```

#### 회사 수정
```javascript
PUT /api/companies/[id]
Body: {
  "name": "수정된 회사명"
}
```

#### 회사 삭제
```javascript
DELETE /api/companies/[id]
```

### 사용자 관리

#### 사용자 목록 조회
```javascript
GET /api/users?company_id=1
```

#### 사용자 생성
```javascript
POST /api/users
Body: {
  "companyId": 1,
  "username": "newuser",
  "password": "password123",
  "name": "새 사용자",
  "grade": "직원",
  "position": "사원",
  "role": "일반 사용자"
}
```

#### 사용자 수정
```javascript
PUT /api/users/[id]
Body: {
  "name": "수정된 이름",
  "grade": "관리자",
  "password": "newpassword" // 선택사항
}
```

#### 사용자 삭제 (비활성화)
```javascript
DELETE /api/users/[id]
```

## 데이터 격리

모든 데이터는 `company_id`로 필터링됩니다:

- **uploads**: 업로드된 파일은 회사별로 분리
- **upload_rows**: 주문 데이터는 회사별로 분리
- **products**: 상품 정보는 회사별로 분리
- **purchase**: 구매처 정보는 회사별로 분리
- **temp_files**: 임시 파일은 회사별로 분리

## 보안 고려사항

1. **비밀번호**: bcryptjs로 해싱되어 저장됩니다.
2. **데이터 격리**: 모든 쿼리에 `company_id` 필터가 자동 적용됩니다.
3. **권한 관리**: 사용자 등급(grade)에 따라 기능 접근을 제어할 수 있습니다.

## 문제 해결

### 마이그레이션 실패 시

1. 데이터베이스 연결 확인
2. 기존 테이블 구조 확인
3. 에러 메시지 확인 후 수동으로 수정

### 로그인 실패 시

1. 사용자가 존재하는지 확인: `GET /api/users`
2. 비밀번호가 올바른지 확인
3. 사용자가 활성화되어 있는지 확인 (`is_active = TRUE`)

### API 호출 시 데이터가 보이지 않는 경우

1. `company-id` 헤더가 올바르게 전달되는지 확인
2. 로그인한 사용자의 `companyId`가 올바른지 확인
3. 해당 회사에 데이터가 실제로 존재하는지 확인
