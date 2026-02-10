import {NextResponse} from "next/server";
import * as crypto from "crypto";
import fs from "fs";

export async function POST() {
  const accessKey = process.env.NEXT_PUBLIC_NCP_ACCESS_KEY_ID!;
  const secretKey = process.env.NEXT_PUBLIC_NCP_SECRET_KEY!;

  // function makeSignature(timestamp: string, method: string, url: string) {
  //   const space = " ";
  //   const newLine = "\n";

  //   const message = [
  //     method,
  //     space,
  //     url,
  //     newLine,
  //     timestamp,
  //     newLine,
  //     access_key_id,
  //   ].join("");

  //   return crypto
  //     .createHmac("sha256", secret_key as string)
  //     .update(message)
  //     .digest("base64");
  // }

  function makeSignature(timestamp: string, method: string, uri: string) {
    const space = " ";
    const newLine = "\n";

    const message =
      method + space + uri + newLine + timestamp + newLine + accessKey;

    return crypto
      .createHmac("sha256", secretKey)
      .update(message)
      .digest("base64");
  }

  try {
    // const timestamp = Date.now().toString();
    // const method = "POST";
    // const url = "/api/v1/mails";

    // const signature = makeSignature(timestamp, method, url);
    // const date = Date.now().toString();
    // const makeSignature = () => {
    //   const message: any[] = [];
    //   const space = " ";
    //   const newLine = "\n";
    //   const method = "POST";
    //   const url = `/api/v1/mails`;
    //   const hmac = crypto.createHmac("sha256", secret_key as string);
    //   message.push(method);
    //   message.push(space);
    //   message.push(url);
    //   message.push(newLine);
    //   message.push(timestamp);
    //   message.push(newLine);
    //   message.push(access_key_id);
    //   const signature = hmac.update(message.join("")).digest("base64");
    //   return signature.toString();
    // };
    const timestamp = Date.now().toString();

    const fileBuffer = fs.readFileSync(
      "/Users/bagdongseog/Downloads/020923323080_외주발주_맛다함.xlsx",
    );

    // 2️⃣ FormData 생성 (내장)
    const formData = new FormData();
    formData.append(
      "fileList",
      new Blob([fileBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      "020923323080_외주발주_맛다함.xlsx",
    );
    const f_response = await fetch(
      "https://mail.apigw.ntruss.com/api/v1/files",
      {
        method: "POST",
        headers: {
          "x-ncp-apigw-timestamp": timestamp,
          "x-ncp-iam-access-key": accessKey,
          "x-ncp-apigw-signature-v2": makeSignature(
            timestamp,
            "POST",
            "/api/v1/files",
          ),
        },
        body: formData,
      },
    );
    const f_data = await f_response.json();

    const get_f_response = await fetch(
      `https://mail.apigw.ntruss.com/api/v1/files/${f_data.tempRequestId}`,
      {
        method: "GET",
        headers: {
          "x-ncp-apigw-timestamp": timestamp,
          "x-ncp-iam-access-key": accessKey,
          "x-ncp-apigw-signature-v2": makeSignature(
            timestamp,
            "GET",
            `/api/v1/files/${f_data.tempRequestId}`,
          ),
        },
      },
    );
    const get_f_data = await get_f_response.json();

    const file_id = get_f_data.files[0].fileId;

    const c_name = "angelfood";
    const vender_name = "천사푸드";
    const multi_line = "<br/>";

    const body = {
      senderAddress: `${c_name}@1004net.cloud`,
      senderName: vender_name,
      title: `날짜_${"업체명"}_${"매입처명"}_발주서`,
      replyTo: "bravesky88@naver.com",
      body:
        "회신은 아래 메일로 부탁드립니다." +
        multi_line +
        "<span style='color: blue; font-size: 20px;'>bravesky88@naver.com</span>" +
        multi_line +
        "발주서 내용입니다.",
      recipients: [
        {
          address: "1004dongseok@gmail.com",
          name: "${매입처명}",
          type: "R",
        },
      ],
      attachFileIds: [file_id],
      individual: true,
      advertising: false,
    };

    const response = await fetch("https://mail.apigw.ntruss.com/api/v1/mails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ncp-apigw-timestamp": timestamp,
        "x-ncp-iam-access-key": accessKey,
        "x-ncp-apigw-signature-v2": makeSignature(
          timestamp,
          "POST",
          "/api/v1/mails",
        ),
      },
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
