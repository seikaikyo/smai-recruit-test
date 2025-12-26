// Vercel Serverless Function - 動態出題 API
// 使用 Claude API 根據使用者行為動態生成題目

export const config = {
  runtime: 'edge'
}

export default async function handler(request) {
  // 只允許 POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const body = await request.json()
    const { position, behavior, previousQuestions, difficulty } = body

    // 驗證必要參數
    if (!position) {
      return new Response(JSON.stringify({ error: 'Position is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 從環境變數取得 API Key
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 分析行為模式
    const behaviorAnalysis = analyzeBehavior(behavior)

    // 建立 Claude prompt
    const prompt = buildPrompt(position, behaviorAnalysis, previousQuestions, difficulty)

    // 呼叫 Claude API
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    })

    if (!claudeResponse.ok) {
      const error = await claudeResponse.text()
      console.error('Claude API error:', error)
      return new Response(JSON.stringify({ error: 'Failed to generate question' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const claudeData = await claudeResponse.json()
    const generatedContent = claudeData.content[0].text

    // 解析 Claude 回應
    const question = parseQuestionFromResponse(generatedContent)

    return new Response(JSON.stringify({
      success: true,
      question,
      aiInsight: behaviorAnalysis.insight
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

// 分析使用者行為
function analyzeBehavior(behavior) {
  if (!behavior) {
    return {
      pattern: 'normal',
      insight: '讓我們開始了解你吧！',
      suggestedDifficulty: '中等'
    }
  }

  const {
    avgResponseTime = 30,
    correctRate = 0.5,
    changeCount = 0,
    questionCount = 0
  } = behavior

  let pattern = 'normal'
  let insight = ''
  let suggestedDifficulty = '中等'

  // 分析回應速度
  if (avgResponseTime < 10) {
    pattern = 'quick'
    insight = '你的反應很快！'
  } else if (avgResponseTime > 45) {
    pattern = 'thoughtful'
    insight = '你很謹慎思考每個問題'
  }

  // 分析正確率
  if (correctRate > 0.8) {
    suggestedDifficulty = '進階'
    insight += ' 看來這些題目對你來說太簡單了，讓我出點有挑戰性的！'
  } else if (correctRate < 0.4) {
    suggestedDifficulty = '基礎'
    insight += ' 沒關係，讓我換個角度問問看'
  }

  // 分析猶豫程度
  if (changeCount > questionCount * 0.3) {
    pattern = 'hesitant'
    insight += ' 相信你的第一直覺！'
  }

  return {
    pattern,
    insight: insight || '繼續保持！',
    suggestedDifficulty
  }
}

// 建立 Claude prompt
function buildPrompt(position, behaviorAnalysis, previousQuestions, difficulty) {
  const positionPrompts = {
    'vue': 'Vue 3 Composition API, Tailwind CSS, DaisyUI',
    'fullstack': 'Vite, Shoelace, Prisma, PostgreSQL',
    'angular': 'Angular 21, PrimeNG, TypeScript, Signals',
    'python': 'FastAPI, SQLModel, PostgreSQL',
    'ai': 'YOLO11, OpenCV, PyTorch, 電腦視覺',
    'devops': 'Docker, CI/CD, Shell, Git hooks',
    'iot': 'PLC/HMI, Modbus TCP, MQTT, Node-RED'
  }

  const tech = positionPrompts[position] || '軟體開發'
  const targetDifficulty = difficulty || behaviorAnalysis.suggestedDifficulty

  const previousQuestionsText = previousQuestions?.length > 0
    ? `\n\n已經問過的題目（請勿重複）：\n${previousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
    : ''

  return `你是 SMAI 技術人才測驗系統的出題 AI。請根據以下條件生成一道選擇題：

職位：${position}
技術領域：${tech}
難度：${targetDifficulty}
考生行為模式：${behaviorAnalysis.pattern}
${previousQuestionsText}

請用以下 JSON 格式回覆（只回覆 JSON，不要其他文字）：
{
  "question": "題目內容",
  "options": ["選項A", "選項B", "選項C", "選項D"],
  "answer": 0,
  "explanation": "答案解釋",
  "difficulty": "${targetDifficulty}",
  "category": "技術類別"
}

注意事項：
1. 題目要實用，考驗真實工作能力
2. 選項要有區辨度，避免明顯的誘答
3. answer 是正確答案的索引（0-3）
4. 使用正體中文（台灣用語）`
}

// 解析 Claude 回應
function parseQuestionFromResponse(response) {
  try {
    // 嘗試直接解析 JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    throw new Error('No JSON found in response')
  } catch (error) {
    console.error('Parse error:', error)
    // 回傳預設題目
    return {
      question: '解析錯誤，請重試',
      options: ['選項 A', '選項 B', '選項 C', '選項 D'],
      answer: 0,
      explanation: '系統錯誤',
      difficulty: '中等',
      category: '系統'
    }
  }
}
