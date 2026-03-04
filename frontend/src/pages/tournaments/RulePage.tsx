const rules = [
  { title: "Thể thức", content: "Single Elimination, Best of 5. Swiss Round cho vòng bảng." },
  { title: "Đăng ký", content: "Đăng ký qua Discord server. Tối đa 16 người chơi." },
  { title: "Check-in", content: "Check-in trước 30 phút khi giải bắt đầu. Không check-in = loại." },
  { title: "Disconnect", content: "Nếu disconnect trước vòng 3, được chơi lại. Sau vòng 3, tính kết quả hiện tại." },
  { title: "Fair Play", content: "Cấm sử dụng bug/exploit. Vi phạm sẽ bị loại và ban khỏi các giải sau." },
  { title: "Tranh chấp", content: "Mọi tranh chấp do ban tổ chức quyết định. Quyết định là cuối cùng." },
];

const RulePage = () => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-heading">Luật thi đấu</h2>
      <div className="space-y-4">
        {rules.map((rule, i) => (
          <div key={i} className="neo-box-sm bg-card p-5">
            <h3 className="font-heading text-primary mb-2">{i + 1}. {rule.title}</h3>
            <p className="text-muted-foreground text-sm">{rule.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RulePage;
