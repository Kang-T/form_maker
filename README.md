# Form:Magic - AI Google Form Generator

Form:Magic is a powerful, locally-deployable web application that converts text into structured Google Forms using AI. Built with React, Vite, Express, and the Google Forms API, it provides a seamless workflow for educators and professionals to create quizzes and surveys instantly.

## 🌟 최적의 활용 방법: Gemini Gem과 연동하기

가장 훌륭한 활용 방법은 구글의 **Gemini Gem** 기능을 활용하여 문제를 생성한 뒤, Form:Magic으로 1초 만에 구글 폼(Google Classroom 과제용)으로 변환하는 것입니다.

### 💡 Gemini Gem 프롬프트 설정
아래 텍스트를 그대로 복사하여 Gemini의 커스텀 Gem 설정(또는 프롬프트 창)에 붙여넣으세요.

```text
[역할 정의]

너는 사용자가 입력한 학습 자료나 텍스트를 기반으로, Google Form 자동 생성 프로그램인 'Form:Magic'의 **로컬 파싱 규격(Local Sync Format)**에 맞게 문제를 생성하는 전문 출제 위원이다.

[출력 규칙 - 반드시 준수]

문제 구분: 문제와 문제 사이에는 반드시 한 줄의 빈 줄을 둔다.

문제 제목: 문제 번호 뒤에 제목을 쓴다. (예: 1. 다음 중...)

보기 형식: 각 보기는 A), B), C), D) 형식을 사용하며 줄바꿈으로 구분한다.

정답 표시: 반드시 정답: 키워드로 시작한다.

해설 표시: 반드시 해설: 키워드로 시작한다.

배점 표시: 반드시 배점: 키워드로 시작하며 숫자만 적는다.

금지 사항: 서론, 결론, "네 알겠습니다" 등의 인사말은 일절 생략하고 문제 데이터만 출력한다.

[출력 양식 예시]

1. 대한민국에서 가장 높은 산은 어디입니까?
A) 설악산
B) 한라산
C) 지리산
D) 북한산
정답: B
해설: 한라산은 높이 1,947m로 대한민국에서 가장 높은 산입니다.
배점: 10

2. 다음 중 전기를 통하지 않는 재료(절연체)를 고르세요.
A) 구리
B) 알루미늄
C) 고무
D) 철
정답: C
해설: 고무는 전기가 흐르지 않는 대표적인 절연체입니다.
배점: 10
```

### 🚀 사용 순서
1. 위 프롬프트가 적용된 **Gemini Gem**에 교과서 내용이나 학습 자료를 붙여넣습니다.
2. Gemini가 출력한 '문제 데이터' 전체를 드래그해서 복사합니다.
3. **Form:Magic** 메인 화면의 텍스트 박스에 붙여넣고 **[LOCAL SYNC]** 버튼을 누릅니다.
4. **[DEPLOY TO GOOGLE]** 버튼을 눌러 구글 폼으로 내보냅니다.
5. 생성된 폼을 Google Classroom에 과제로 첨부하면 온라인 평가 준비 끝!

---

## 🛠️ Installation & Setup (개발자용)

### Prerequisites
- Node.js (v18 or higher)
- Google Cloud Platform Account (for OAuth 2.0 Client ID)
- Gemini API Key

### Local Development
1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and fill in your credentials:
   - `GEMINI_API_KEY`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `APP_URL=http://localhost:4000`
4. Start the development server: `npm run dev`

### Production Deployment (Google Cloud Run)
1. Commit all changes and push to GitHub.
2. In Google Cloud Console, navigate to Cloud Run > Create Service.
3. Select "Continuously deploy from a repository".
4. Choose this repository and `main` branch.
5. In "Variables & Secrets" section, add all required environment variables.
6. Make sure to update `APP_URL` in Cloud Run to the generated deployment URL.
7. Update Google Cloud OAuth Consent Screen "Authorized redirect URIs" to match the new `APP_URL`.
