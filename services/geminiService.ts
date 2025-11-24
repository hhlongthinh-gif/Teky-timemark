import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeImage = async (base64Image: string): Promise<string> => {
  try {
    // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
    const base64Data = base64Image.split(',')[1];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: 'image/jpeg',
            },
          },
          {
            text: 'Hãy mô tả chi tiết những gì bạn thấy trong bức ảnh này bằng tiếng Việt. Tập trung vào khung cảnh, vật thể chính và điều kiện ánh sáng.',
          },
        ],
      },
    });

    return response.text || "Không thể phân tích hình ảnh.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "Đã xảy ra lỗi khi kết nối với AI. Vui lòng thử lại.";
  }
};
