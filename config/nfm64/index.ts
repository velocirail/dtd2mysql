
import NFM64 from "./file/nfm64";
import {FeedConfig} from "../index";

export const downloadUrl = "http://iblocks-rg-publication.s3-website-eu-west-1.amazonaws.com/nfm64.zip";

const specification = {
  "": NFM64
} satisfies FeedConfig;

export default specification;
