import {NextResponse} from "next/server";
import * as crypto from "crypto";

export async function POST() {
  const access_key_id = process.env.NCP_ACCESS_KEY_ID;
  const secret_key = process.env.NCP_SECRET_KEY;

  function makeSignature(timestamp: string, method: string, url: string) {
    const space = " ";
    const newLine = "\n";

    const message = [
      method,
      space,
      url,
      newLine,
      timestamp,
      newLine,
      access_key_id,
    ].join("");

    return crypto
      .createHmac("sha256", secret_key as string)
      .update(message)
      .digest("base64");
  }

  try {
    const timestamp = Date.now().toString();
    const method = "POST";
    const url = "/api/v1/mails";

    const signature = makeSignature(timestamp, method, url);
    // const date = Date.now().toString();
    // const makeSignature = () => {
    //   const message: any[] = [];
    //   const method = "POST";
    //   const space = " ";
    //   const newLine = "\n";
    //   const url = `api/v1/mails`;
    //   const hmac = crypto.createHmac("sha256", secret_key);
    //   message.push(method);
    //   message.push(space);
    //   message.push(url);
    //   message.push(newLine);
    //   message.push(date);
    //   message.push(newLine);
    //   message.push(access_key_id);
    //   const signature = hmac.update(message.join("")).digest("base64");
    //   return signature.toString();
    // };
    const body = {
      senderAddress: "@xn--hy1b07t6sj80h.com",
      title: "${customer_name}님 반갑습니다. ",
      body: "귀하의 등급이 ${BEFORE_GRADE}에서 ${AFTER_GRADE}로 변경되었습니다.",
      recipients: [
        {
          address: "az8601@gmail.com",
          name: "박동석",
          type: "R",
          parameters: {
            customer_name: "홍길동",
            BEFORE_GRADE: "SILVER",
            AFTER_GRADE: "GOLD",
          },
        },
      ],
      individual: true,
      advertising: false,
    };

    const response = await fetch("https://mail.apigw.ntruss.com/api/v1/mails", {
      headers: {
        "Content-Type": "application/json",
        "x-ncp-iam-access-key": access_key_id as string,
        "x-ncp-apigw-timestamp": timestamp,
        "x-ncp-apigw-signature-v2": signature,
        "x-ncp-lang": "ko-KR",
      },
      method: "POST",
      body: JSON.stringify(body),
    });

    const data = await response.json();
    console.log("data", data);

    // const data = await response.json();
    // if (data.success) {
    //   return NextResponse.json({success: true, message: "success"});
    // } else {
    //   return NextResponse.json({success: false, message: "error"});
    // }
  } catch (error) {
    return NextResponse.json({success: false, message: "error"});
  } finally {
    return NextResponse.json({success: true, message: "success"});
  }
}
