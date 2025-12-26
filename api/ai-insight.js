// Vercel Serverless Function - AI 洞察 API
// 根據使用者行為生成個人化提示訊息

export const config = {
  runtime: 'edge'
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const body = await request.json()
    const { behavior, questionType, questionCategory, position } = body

    // 生成個人化訊息（不需要 Claude API，用規則引擎）
    const insight = generateInsight(behavior, questionType, questionCategory, position)

    return new Response(JSON.stringify({
      success: true,
      message: insight.message,
      encouragement: insight.encouragement,
      tip: insight.tip
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

function generateInsight(behavior, questionType, questionCategory, position) {
  const {
    avgResponseTime = 30,
    correctRate = 0.5,
    consecutiveCorrect = 0,
    consecutiveWrong = 0,
    questionIndex = 0,
    totalQuestions = 12
  } = behavior || {}

  // 進度訊息
  const progress = Math.round((questionIndex / totalQuestions) * 100)
  let progressMsg = ''
  if (progress < 25) {
    progressMsg = '剛開始熱身，放輕鬆！'
  } else if (progress < 50) {
    progressMsg = '進度順利，繼續保持！'
  } else if (progress < 75) {
    progressMsg = '已經過半了，加油！'
  } else {
    progressMsg = '快到終點了，最後衝刺！'
  }

  // 根據連續答對/答錯調整鼓勵
  let encouragement = ''
  if (consecutiveCorrect >= 3) {
    encouragement = '連續答對 ' + consecutiveCorrect + ' 題！你太厲害了！'
  } else if (consecutiveWrong >= 2) {
    encouragement = '別氣餒，換個角度思考看看'
  } else if (correctRate > 0.7) {
    encouragement = '正確率很高，繼續保持！'
  } else {
    encouragement = '每一題都是學習的機會'
  }

  // 根據題目類型給提示
  let tip = ''
  if (questionCategory === '人格特質') {
    tip = '這題沒有對錯，誠實回答就好'
  } else if (questionType === 'implement') {
    tip = '記得說明你的思路，不只是貼程式碼'
  } else if (questionType === 'review') {
    tip = '找出潛在問題，並說明為什麼是問題'
  } else {
    // 選擇題的小技巧
    const tips = [
      '仔細看每個選項的差異',
      '排除法有時候很有用',
      '相信你的直覺，但也要驗證',
      '如果不確定，先選最接近的答案'
    ]
    tip = tips[questionIndex % tips.length]
  }

  // 根據反應時間調整訊息
  let message = progressMsg
  if (avgResponseTime < 10 && correctRate > 0.7) {
    message = '反應快又準確，impressive！'
  } else if (avgResponseTime > 45) {
    message = '慢慢想沒關係，答對最重要'
  }

  return {
    message,
    encouragement,
    tip
  }
}
