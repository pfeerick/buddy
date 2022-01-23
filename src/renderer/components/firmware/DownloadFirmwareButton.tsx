import { DownloadOutlined } from "@ant-design/icons";
import { gql, useApolloClient } from "@apollo/client";
import { Button, message } from "antd";
import React, { useState } from "react";
import { decodePrVersion, isPrVersion } from "shared/tools";
import * as base64ArrayBuffer from "base64-arraybuffer";
import { ButtonSize, ButtonType } from "antd/lib/button";
import { hasFilesystemApi } from "renderer/compatibility/checks";
import legacyDownload from "js-file-download";
import config from "shared/config";

type Props = {
  target?: string;
  version?: string;
  children: string;
  type?: ButtonType;
  size?: ButtonSize;
};

const DownloadFirmwareButton: React.FC<Props> = ({
  target,
  version,
  children,
  type,
  size,
}) => {
  const [downloading, setDownloading] = useState(false);
  const isPr = isPrVersion(version ?? "");
  const isLocal = version === "local";
  const { prId, commitId } = decodePrVersion(version ?? "");
  const validPrVersion = isPr && prId && commitId && target;

  const client = useApolloClient();

  const promptAndDownload = async (
    name: string,
    data: ArrayBufferLike
  ): Promise<void> => {
    if (!hasFilesystemApi || config.isElectron) {
      legacyDownload(data, name, "application/octet-stream");
      return;
    }
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: name,
      types: [
        {
          description: "Firmware data",
          accept: {
            "application/octet-stream": [".bin"],
          },
        },
      ],
    });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  };

  const download = async (): Promise<void> => {
    if (validPrVersion) {
      const response = await client.query({
        query: gql(/* GraphQL */ `
          query PrBuildFirmwareData($prId: ID!, $commitId: ID!, $target: ID!) {
            edgeTxPr(id: $prId) {
              id
              commit(id: $commitId) {
                id
                firmwareBundle {
                  id
                  target(code: $target) {
                    id
                    base64Data
                  }
                }
              }
            }
          }
        `),
        variables: {
          prId,
          commitId,
          target,
        },
      });

      const fileData =
        response.data.edgeTxPr?.commit?.firmwareBundle?.target?.base64Data;

      if (fileData) {
        await promptAndDownload(
          `${target}-${commitId.slice(0, 7)}.bin`,
          base64ArrayBuffer.decode(fileData)
        );
      }
    } else if (!isLocal && target && version) {
      const response = await client.query({
        query: gql(/* GraphQL */ `
          query ReleaseFirmwareData($version: ID!, $target: ID!) {
            edgeTxRelease(id: $version) {
              id
              firmwareBundle {
                id
                target(code: $target) {
                  id
                  base64Data
                }
              }
            }
          }
        `),
        variables: {
          target,
          version,
        },
      });

      const fileData =
        response.data.edgeTxRelease?.firmwareBundle.target?.base64Data;

      if (fileData) {
        await promptAndDownload(
          `${target}-${version}.bin`,
          base64ArrayBuffer.decode(fileData)
        );
      }
    }
  };

  return (
    <Button
      type={type}
      icon={<DownloadOutlined />}
      loading={downloading}
      disabled={!target || !version || isLocal}
      size={size}
      onClick={async () => {
        setDownloading(true);
        await download()
          .then(() => {
            void message.success("Firmware file saved");
          })
          .catch((e: Error) => {
            void message.error(`Could not download firmware: ${e.message}`);
          });
        setDownloading(false);
      }}
    >
      {children}
    </Button>
  );
};

export default DownloadFirmwareButton;