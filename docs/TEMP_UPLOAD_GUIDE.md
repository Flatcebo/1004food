# 임시 저장 기능 가이드

## 개요

엑셀 파일 업로드 시 서버에 임시 저장하여 새로고침해도 데이터가 유지되며, 수정 후 확인하면 DB에 정식 저장되는 기능입니다.

## 주요 기능

1. **엑셀 파일 업로드 시 서버에 임시 저장**
   - 파일 업로드 시 자동으로 서버의 `temp_upload_files` 테이블에 저장
   - 세션 ID 기반으로 관리되어 새로고침해도 데이터 유지

2. **업로드된 파일 목록에서 개별 확인**
   - "보기" 버튼 클릭 → `/upload/view` 페이지에서 데이터 수정
   - 수정 후 "확인" 버튼 클릭 → 서버의 임시 저장 데이터 업데이트

3. **Upload 버튼으로 정식 저장**
   - 확인된 파일들만 DB에 정식 저장 (`uploads`, `upload_rows` 테이블)
   - 저장 완료 후 임시 저장 데이터 자동 삭제

## 데이터베이스 스키마

### temp_uploads 테이블
```sql
CREATE TABLE temp_uploads (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### temp_upload_files 테이블
```sql
CREATE TABLE temp_upload_files (
  id SERIAL PRIMARY KEY,
  temp_upload_id INTEGER REFERENCES temp_uploads(id) ON DELETE CASCADE,
  file_id VARCHAR(255) UNIQUE NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  row_count INTEGER NOT NULL,
  table_data JSONB NOT NULL,
  header_index JSONB,
  product_code_map JSONB,
  is_confirmed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 설치 및 초기화

### 1. DB 테이블 생성

임시 저장용 테이블을 생성하려면 다음 API를 호출하세요:

```bash
curl -X POST http://localhost:3000/api/upload/temp/init
```

또는 브라우저에서:
```
POST /api/upload/temp/init
```

### 2. 확인

테이블이 정상적으로 생성되었는지 확인:

```sql
-- PostgreSQL
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('temp_uploads', 'temp_upload_files');
```

## API 엔드포인트

### 1. 임시 저장 테이블 초기화
- **Endpoint**: `POST /api/upload/temp/init`
- **설명**: temp_uploads, temp_upload_files 테이블 생성

### 2. 파일 임시 저장
- **Endpoint**: `POST /api/upload/temp/save`
- **Body**:
  ```json
  {
    "sessionId": "session-1234567890-abc123",
    "files": [
      {
        "id": "file-id-1",
        "fileName": "order.xlsx",
        "rowCount": 10,
        "tableData": [[...], [...]],
        "headerIndex": {"nameIdx": 5},
        "productCodeMap": {"상품1": "CODE1"}
      }
    ]
  }
  ```

### 3. 임시 파일 목록 조회
- **Endpoint**: `GET /api/upload/temp/list?sessionId={sessionId}`
- **Response**:
  ```json
  {
    "success": true,
    "data": [...],
    "count": 3
  }
  ```

### 4. 임시 파일 데이터 수정
- **Endpoint**: `PUT /api/upload/temp/update`
- **Body**:
  ```json
  {
    "fileId": "file-id-1",
    "tableData": [[...], [...]],
    "headerIndex": {"nameIdx": 5},
    "productCodeMap": {"상품1": "CODE1"},
    "isConfirmed": true
  }
  ```

### 5. 임시 파일 삭제
- **Endpoint**: `DELETE /api/upload/temp/delete?fileId={fileId}`
- **또는**: `DELETE /api/upload/temp/delete?sessionId={sessionId}` (세션 전체 삭제)

### 6. 임시 데이터 정식 저장 및 삭제
- **Endpoint**: `POST /api/upload/temp/confirm`
- **Body**:
  ```json
  {
    "sessionId": "session-1234567890-abc123"
  }
  ```
- **동작**:
  1. 확인된 파일들만 `uploads`, `upload_rows` 테이블에 저장
  2. 저장 완료 후 해당 세션의 임시 데이터 삭제

## 사용 흐름

### 1. 파일 업로드
```
사용자 → 엑셀 파일 선택 
       → 클라이언트에서 파일 파싱
       → /api/upload/temp/save 호출 (자동)
       → 서버에 임시 저장
```

### 2. 새로고침 후 복원
```
페이지 새로고침 
       → 모달 열기
       → /api/upload/temp/list 호출 (자동)
       → 임시 저장된 파일 목록 불러오기
```

### 3. 파일 수정 및 확인
```
"보기" 버튼 클릭 
       → /upload/view 페이지로 이동
       → 데이터 수정
       → "확인" 버튼 클릭
       → /api/upload/temp/update 호출 (is_confirmed: true)
       → 서버의 임시 데이터 업데이트
```

### 4. 정식 저장
```
"Upload" 버튼 클릭 
       → /api/upload/temp/confirm 호출
       → 확인된 파일들 정식 저장 (uploads, upload_rows)
       → 임시 저장 데이터 삭제
       → 완료!
```

## 주의사항

1. **세션 ID 관리**
   - 세션 ID는 브라우저의 sessionStorage에 저장됩니다
   - 브라우저를 완전히 닫으면 세션 ID가 사라지므로 새로운 세션이 생성됩니다

2. **임시 데이터 정리**
   - 임시 데이터는 정식 저장 시 자동으로 삭제됩니다
   - 오래된 임시 데이터는 주기적으로 정리하는 것을 권장합니다 (크론 작업 등)

3. **동시 접속**
   - 여러 브라우저/탭에서 동시에 작업 시 세션 ID가 다르므로 각각 독립적으로 동작합니다

## 트러블슈팅

### 임시 저장 데이터가 보이지 않는 경우
1. 브라우저의 sessionStorage 확인:
   ```javascript
   console.log(sessionStorage.getItem('uploadSessionId'));
   ```

2. DB에서 직접 확인:
   ```sql
   SELECT * FROM temp_uploads ORDER BY created_at DESC LIMIT 10;
   SELECT * FROM temp_upload_files ORDER BY created_at DESC LIMIT 10;
   ```

### 저장 시 오류 발생
1. DB 연결 확인
2. 테이블이 정상적으로 생성되었는지 확인
3. 브라우저 콘솔에서 네트워크 탭 확인

## 개발 정보

### 관련 파일
- **API**: `/app/api/upload/temp/` (init, save, list, update, delete, confirm)
- **Store**: `/stores/uploadStore.ts`
- **Hooks**: `/hooks/useFileSave.ts`
- **Pages**: `/app/order/page.tsx`, `/app/upload/view/page.tsx`

### 데이터 흐름
```
uploadStore.handleFile()
  → processFile()
  → addUploadedFile()
  → saveFilesToServer() → /api/upload/temp/save

모달 열기
  → loadFilesFromServer() → /api/upload/temp/list

확인 버튼
  → handleConfirm() → /api/upload/temp/update

Upload 버튼
  → handleSaveWithConfirmedFiles() → /api/upload/temp/confirm
```

## 라이선스

이 프로젝트는 내부용으로 제작되었습니다.

