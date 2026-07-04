-- Seed luật thi đấu cho tournament_id = 100
-- Chạy trên Supabase SQL Editor (bảng rules phải đã tồn tại).

BEGIN;

DELETE FROM public.rules
WHERE tournament_id = 100;

INSERT INTO public.rules (tournament_id, title, content)
VALUES
  (
    100,
    'Giới thiệu',
    'Giải đấu Thể thao Điện tử bộ môn Liên Quân Mobile do Câu lạc bộ Thể thao Điện tử THPT Phú Nhuận – DCN (sau đây gọi tắt là BTC) độc quyền tổ chức và vận hành.

Bộ luật này (sau đây gọi là "Luật thi đấu") áp dụng bắt buộc đối với tất cả các đội tuyển, tuyển thủ chính thức và tuyển thủ dự bị (gọi chung là "Thành viên đội tuyển") tham gia giải đấu.

Luật thi đấu được xây dựng nhằm đảm bảo tính minh bạch, chính trực, tính chuyên nghiệp và cạnh tranh công bằng tuyệt đối trong hệ thống giải đấu của DCN. Quy định được chuẩn hóa dựa trên luật thi đấu chính thức của Garena Liên Quân Mobile.'
  ),
  (
    100,
    'Điều kiện đội tuyển và tuyển thủ',
    'Để được chấp thuận tham gia giải đấu, các đội tuyển và cá nhân phải đáp ứng đầy đủ các tiêu chí bắt buộc từ BTC.

Số lượng thành viên mỗi đội tuyển:
- Tối thiểu: 05 tuyển thủ chính thức.
- Tối đa: 08 thành viên (bao gồm cả tuyển thủ dự bị).

Điều kiện tuyển thủ (Yêu cầu bắt buộc phải là PNer):
- Học sinh đang theo học tại Trường THPT Phú Nhuận, hoặc
- Cựu học sinh Trường THPT Phú Nhuận.

Lưu ý: Đây là điều kiện tiên quyết để tham gia giải. BTC đề cao tính trung thực và không yêu cầu nộp giấy tờ xác minh danh tính hoặc minh chứng học sinh khi đăng ký, nhưng sẽ hậu kiểm và xử lý nghiêm nếu có khiếu nại.'
  ),
  (
    100,
    'Tính hợp lệ của đội tuyển',
    'Mọi đội tuyển phải hoàn thiện và đảm bảo tính hợp lệ trước ngày khởi tranh:
- Toàn bộ tuyển thủ trong danh sách đáp ứng đúng điều kiện tham gia.
- Mỗi tuyển thủ chỉ được phép đăng ký và thi đấu cho 01 đội tuyển duy nhất trong suốt giải đấu.
- Đội tuyển không được phép thay đổi, bổ sung hoặc loại bỏ nhân sự sau khi thời hạn đăng ký kết thúc và trong suốt quá trình giải đấu diễn ra.'
  ),
  (
    100,
    'Đội hình thi đấu',
    'Trước mỗi trận đấu, đội trưởng phải chốt và thông báo đội hình ra sân (họ tên 05 tuyển thủ thi đấu) cho BTC hoặc trọng tài giám sát theo đúng thời gian quy định.

Quy định thay người:
- Tuyệt đối không thay đổi nhân sự khi ván đấu đang diễn ra.
- Việc thay đổi tuyển thủ giữa các ván đấu phải được khai báo rõ ràng (tuyển thủ ra sân và tuyển thủ vào sân) với trọng tài giám sát.
- Thời gian chuẩn bị và thay đổi giữa các ván đấu tối đa là 05 phút, tính từ thời điểm ván trước kết thúc.

Quy định về tài khoản (In-game):
- Đội hình thi đấu phải sử dụng đúng tài khoản nhận thưởng đã cung cấp cho BTC lúc đăng ký. Tuyển thủ có thể dùng tài khoản khác để thi đấu, nhưng khi trao giải, BTC chỉ phát thưởng vào đúng tài khoản đã đăng ký ban đầu.
- Tên tài khoản (IGN) của tuyển thủ phải phù hợp với thuần phong mỹ tục. BTC có quyền yêu cầu đổi tên nếu phát hiện vi phạm. Trường hợp tuyển thủ không chấp hành, BTC có quyền tước quyền thi đấu của tài khoản đó.'
  ),
  (
    100,
    'Kiểm tra hành vi tuyển thủ',
    'Hành vi của tuyển thủ sẽ được BTC thẩm định trước khi phê duyệt quyền tham gia và giám sát định kỳ trong suốt quá trình diễn ra giải đấu. Mục tiêu nhằm đảm bảo mọi trận đấu diễn ra với tinh thần thể thao điện tử trung thực, lành mạnh và văn minh.

Mọi hành vi không tuân thủ quy tắc ứng xử do BTC DCN ban hành sẽ phải chịu các hình thức kỷ luật từ cảnh cáo, cấm thi đấu trận kế tiếp cho đến truất quyền tham dự giải đấu.'
  ),
  (
    100,
    'Quy định kỹ thuật',
    'Tuyển thủ có trách nhiệm tuân thủ nghiêm ngặt các thông số kỹ thuật của trò chơi để đảm bảo tính cân bằng.

Phiên bản áp dụng:
- Giải đấu vận hành hoàn toàn trên phiên bản mới nhất của máy chủ Garena Liên Quân Mobile (Máy chủ Mặt Trời).

Hạn chế Tướng và Trang phục:
- Tướng, trang phục hoặc trang bị mới phát hành sẽ tự động bị cấm (khóa) trong vòng 14 ngày kể từ ngày cập nhật tại máy chủ chính thức. (Ví dụ: Tướng ra mắt ngày 19/10 sẽ chỉ được phép sử dụng từ ngày 03/11).
- BTC có quyền bổ sung danh sách cấm đối với một số trang phục hoặc trang bị tại bất kỳ thời điểm nào trước hoặc trong trận đấu nếu phát hiện lỗi game (bug) liên quan.'
  ),
  (
    100,
    'Quy trình thi đấu',
    'Quy trình này áp dụng đồng bộ cho toàn bộ các trận đấu trong khuôn khổ giải.

Hình thức thi đấu: Online. BTC sẽ cung cấp kênh liên lạc, phòng thi đấu (custom room) và hướng dẫn kỹ thuật trước ngày thi đấu.

Thời gian và Điểm danh:
- Các đội tuyển phải có mặt đầy đủ tại kênh truyền thông do BTC chỉ định trước giờ thi đấu 30 phút để làm thủ tục điểm danh.
- Quá 15 phút so với lịch thi đấu chính thức, nếu đội tuyển không tập hợp đủ thành viên thi đấu, BTC sẽ xử thua ván/trận đấu đó ngay lập tức.
- Đội hoàn thành thủ tục điểm danh đúng hạn sẽ giành quyền chọn bên (Xanh/Đỏ) cho ván đấu đầu tiên (nếu thể thức trận đấu đó cho phép).

Quy định tạm dừng trận đấu (Pause):
- Tuyển thủ chỉ được phép báo dừng trận đấu khi gặp sự cố bất khả kháng: văng game, ngắt kết nối internet, lỗi thiết bị hoặc lỗi game nghiêm trọng ảnh hưởng trực tiếp đến kết quả.
- Nghiêm cấm hành vi tạm dừng trận đấu khi đang diễn ra giao tranh (tình huống có từ 03 nhân vật trở lên tham gia xung đột).
- Mọi hành vi cố tình lạm dụng tính năng tạm dừng trái quy định sẽ bị BTC xử lý nghiêm theo khung hình phạt.'
  ),
  (
    100,
    'Ứng xử chuyên nghiệp và Kỷ luật',
    'Mọi hành vi vi phạm Luật thi đấu sẽ phải nhận hình thức xử phạt nghiêm khắc từ BTC, bao gồm: Cảnh cáo, cấm thi đấu ván/trận, xử thua, tước quyền tham gia giải, hủy bỏ toàn bộ kết quả, danh hiệu và giải thưởng tùy theo mức độ nghiêm trọng.

Nghiêm cấm các hành vi tiêu cực:
- Thông đồng, thỏa hiệp, cá độ hoặc dàn xếp tỷ số trận đấu.
- Thi đấu thiếu tích cực, cố tình nhường điểm hoặc cố tình thua vì bất kỳ mục đích nào.
- Ép buộc, đe dọa hoặc thao túng người chơi khác để làm sai lệch kết quả.

Nghiêm cấm các hành vi gian lận:
- Thi đấu hộ, cày thuê, sử dụng tài khoản của người khác để thi đấu (đóng thế).
- Cung cấp thông tin gian lận, sai sự thật cho BTC.
- Sử dụng phần mềm thứ ba, công cụ hack, cheat, bot can thiệp vào trò chơi.
- Lợi dụng lỗi game (bug exploit), sử dụng thiết bị ngoại vi không được phép hoặc cố ý ngắt kết nối để trục lợi.

Quy định về phát ngôn và giao tiếp:
- Nghiêm cấm sử dụng ngôn từ kích động, tục tĩu, lăng mạ hoặc khiếm nhã (bao gồm cả kênh chat in-game và mạng xã hội).
- Nghiêm cấm các hành vi phân biệt đối xử, xúc phạm nhân phẩm, khiêu khích đối thủ, khán giả hoặc thành viên BTC.
- Mọi hành vi bôi nhọ uy tín của BTC DCN hoặc nhà phát hành Garena đều bị xử lý ở khung hình phạt cao nhất.'
  ),
  (
    100,
    'Điều khoản thi hành',
    'Các tuyển thủ và đội tuyển tham gia giải đồng nghĩa với việc cam kết tuân thủ tuyệt đối sự điều hành, hướng dẫn và phán quyết cuối cùng của BTC DCN.

Bất kỳ thành viên nào vi phạm Luật thi đấu hoặc vi phạm pháp luật nước CHXHCN Việt Nam trong thời gian diễn ra giải đấu đều phải chịu trách nhiệm trước BTC và các cơ quan có thẩm quyền.

BTC DCN giữ quyền hạn cao nhất trong việc sửa đổi, bổ sung hoặc thay thế các điều khoản trong Luật thi đấu tại bất kỳ thời điểm nào. Các thay đổi (nếu có) sẽ được thông báo chính thức đến đại diện các đội tuyển trước khi áp dụng.'
  );

COMMIT;

-- Kiểm tra
SELECT id, tournament_id, title, LEFT(content, 100) AS content_preview
FROM public.rules
WHERE tournament_id = 100
ORDER BY id ASC;
