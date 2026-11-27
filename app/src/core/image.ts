import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type Attachment = { uri: string; data: string; mediaType: 'image/jpeg' };

const MAX_WIDTH = 1400;
// Claude 는 한 장당 5MB 까지. 긴 영수증도 읽히도록 폭 1400px, JPEG 0.7 로 줄인다
const toAttachment = async (asset: ImagePicker.ImagePickerAsset): Promise<Attachment> => {
  const ctx = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  if (asset.width > MAX_WIDTH) ctx.resize({ width: MAX_WIDTH });
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  if (!out.base64) throw new Error('이미지를 변환하지 못했어요');
  return { uri: out.uri, data: out.base64, mediaType: 'image/jpeg' };
};

/** 카메라로 촬영 (권한이 없으면 요청). 취소하면 null */
export async function takePhoto(): Promise<Attachment | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('카메라 권한이 필요해요. 설정에서 허용해 주세요.');
  const r = await ImagePicker.launchCameraAsync({ quality: 0.9 });
  return r.canceled || !r.assets[0] ? null : toAttachment(r.assets[0]);
}

/** 앨범에서 선택. 취소하면 null */
export async function pickPhoto(): Promise<Attachment | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
  return r.canceled || !r.assets[0] ? null : toAttachment(r.assets[0]);
}
